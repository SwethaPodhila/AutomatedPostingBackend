import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import userRoutes from "./routes/user.routes.js";
import socialRoutes from "./routes/social.routes.js";
import * as facebookController from "./controllers/social.controller.js";
import instagramRoutes from "./routes/instagram.routes.js";

dotenv.config();
connectDB();

const app = express();

// ✅ CORS setup for multiple origins
const allowedOrigins = [
  "http://localhost:3000", // your local frontend
  "https://automatedpostingsfrontend.onrender.com" // deployed frontend
];

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin like Postman
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/user", userRoutes);
app.use("/social", socialRoutes);
app.use("/social/instagram", instagramRoutes);

// publish & metrics
//app.post('/publish/facebook', facebookController.publish);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} 🚀`);
});


//poojitha

// Twitter Auth
app.get("/auth/twitter", async (req, res) => {
  try {
    console.log('===== TWITTER AUTH START =====');
    console.log('Generating Twitter OAuth for user:', req.query.userId || 'unknown');
    
    if (req.query.userId) {
      req.session.userId = req.query.userId;
    }
    
    const { TwitterApi } = await import("twitter-api-v2");
    
    const twitterClient = new TwitterApi({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    });
    
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
      `${process.env.BACKEND_URL || 'https://automatedpostingbackend.onrender.com'}/auth/twitter/callback`,
      { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
    );
    
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;
    
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-connect?error=session_error`);
      }
      
      console.log('✅ Session saved, session ID:', req.sessionID);
      console.log('✅ OAuth URL generated:', url);
      
      res.redirect(url);
    });
    
  } catch (error) {
    console.error('❌ OAuth 2.0 generation error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-connect?error=oauth_failed`);
  }
});

// Twitter Callback
app.get("/auth/twitter/callback", async (req, res) => {
  try {
    console.log('\n🔄 Received Twitter callback');
    console.log('Query params:', req.query);
    
    const { code, state } = req.query;
    const sessionState = req.session.state;
    const codeVerifier = req.session.codeVerifier;
    
    if (!state || !sessionState) {
      console.error('❌ State missing:', { queryState: state, sessionState });
      return res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-connect?error=state_missing`);
    }
    
    if (state !== sessionState) {
      console.error('❌ State mismatch');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-connect?error=state_mismatch`);
    }
    
    if (!code || !codeVerifier) {
      console.error('❌ Missing code or codeVerifier');
      return res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-connect?error=missing_params`);
    }
    
    console.log('🔄 Exchanging code for token...');
    
    const { TwitterApi } = await import("twitter-api-v2");
    
    const twitterClient = new TwitterApi({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    });
    
    const { 
      client: loggedClient, 
      accessToken, 
      refreshToken,
      expiresIn 
    } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: `${process.env.BACKEND_URL || 'https://automatedpostingbackend.onrender.com'}/auth/twitter/callback`,
    });
    
    console.log('✅ Token received, fetching user info...');
    
    const user = await loggedClient.v2.me({
      'user.fields': ['profile_image_url', 'name', 'username', 'id']
    });
    
    console.log('✅ User authenticated:', user.data.username);
    
    const userId = req.session.userId;
    
    const SocialAccount = (await import("./models/socialAccount.js")).default;
    
    const twitterAccount = await SocialAccount.findOneAndUpdate(
      { 
        providerId: user.data.id, 
        platform: "twitter"
      },
      {
        user: userId || "unknown",
        platform: "twitter",
        providerId: user.data.id,
        accessToken: accessToken,
        refreshToken: refreshToken,
        scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        meta: {
          twitterId: user.data.id,
          username: user.data.username,
          name: user.data.name,
          profileImage: user.data.profile_image_url,
          expiresIn: expiresIn,
          authenticatedAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Database saved for user:', twitterAccount.user);
    
    delete req.session.codeVerifier;
    delete req.session.state;
    delete req.session.userId;
    
    req.session.save((err) => {
      if (err) console.error('Session cleanup error:', err);
      
      console.log('✅ Redirecting to frontend with success...');
      
      res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-manager?twitter=connected&username=${user.data.username}&userId=${userId || 'unknown'}`);
    });
    
  } catch (error) {
    console.error('❌ OAuth 2.0 callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'https://automatedpostingsfrontend.onrender.com'}/twitter-connect?error=auth_failed&message=${error.message}`);
  }
});

// Twitter Check Endpoint
app.get("/api/twitter/check", async (req, res) => {
    try {
        const { userId } = req.query;
        console.log("🔍 Checking Twitter for user:", userId);
        
        const SocialAccount = (await import("./models/socialAccount.js")).default;
        
        const account = await SocialAccount.findOne({
            user: userId,
            platform: "twitter"
        });
        
        console.log("📊 Found account in DB:", account ? "YES" : "NO");
        
        if (account && account.meta) {
            res.json({
                success: true,
                connected: true,
                account: {
                    username: account.meta.username || account.meta.twitterUsername || "twitter_user",
                    name: account.meta.name || "Twitter User",
                    profileImage: account.meta.profileImage || account.meta.profile_image_url || `https://unavatar.io/twitter/${account.meta.username}`,
                    connectedAt: account.createdAt || account.meta.authenticatedAt || new Date()
                }
            });
        } else {
            res.json({
                success: true,
                connected: false,
                message: "Twitter account not connected"
            });
        }
    } catch (error) {
        console.error("❌ Check error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Twitter Post Endpoint
app.post("/api/twitter/post", async (req, res) => {
    try {
        const { userId, content } = req.body;
        
        if (!userId || !content) {
            return res.status(400).json({
                success: false,
                error: "User ID and content are required"
            });
        }

        const SocialAccount = (await import("./models/socialAccount.js")).default;
        
        const account = await SocialAccount.findOne({
            user: userId,
            platform: "twitter"
        });

        if (!account || !account.accessToken) {
            return res.status(401).json({
                success: false,
                error: "Twitter account not connected or access token missing"
            });
        }

        const { TwitterApi } = await import("twitter-api-v2");
        const twitterClient = new TwitterApi(account.accessToken);
        
        console.log(`🔄 Posting tweet for user: ${account.meta?.username}`);
        
        const tweet = await twitterClient.v2.tweet(content);
        
        console.log(`✅ Tweet posted successfully: ${tweet.data.id}`);
        
        res.json({
            success: true,
            message: "Tweet posted successfully",
            tweetId: tweet.data.id,
            tweetUrl: `https://twitter.com/${account.meta?.username}/status/${tweet.data.id}`,
            username: account.meta?.username
        });
        
    } catch (error) {
        console.error("❌ Tweet post error:", error);
        
        let errorMessage = error.message;
        if (error.code === 403) {
            errorMessage = 'App does not have write permissions.';
        }
        if (error.code === 401) {
            errorMessage = 'Twitter access token expired. Please reconnect.';
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});

// Twitter Disconnect Endpoint
app.post("/api/twitter/disconnect", async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User ID is required"
            });
        }

        const SocialAccount = (await import("./models/socialAccount.js")).default;
        
        const result = await SocialAccount.deleteMany({
            user: userId,
            platform: "twitter"
        });
        
        console.log(`🗑️ Disconnected Twitter for user ${userId}. Deleted: ${result.deletedCount} accounts`);
        
        res.json({
            success: true,
            message: "Twitter account disconnected successfully",
            deletedCount: result.deletedCount
        });
        
    } catch (error) {
        console.error("❌ Disconnect error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== UTILITY ENDPOINTS ====================

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    twitter: process.env.TWITTER_CLIENT_ID ? "ready" : "not_configured",
    session: req.sessionID ? "active" : "inactive",
    sessionId: req.sessionID
  });
});

// Test Session
app.get("/session-test", (req, res) => {
  req.session.testValue = "Hello from session";
  req.session.save((err) => {
    if (err) {
      return res.json({ error: "Session save failed", details: err.message });
    }
    res.json({
      sessionId: req.sessionID,
      sessionData: req.session
    });
  });
});

// Get Session Data
app.get("/session-data", (req, res) => {
  res.json({
    sessionId: req.sessionID,
    codeVerifier: req.session.codeVerifier ? "exists" : "missing",
    state: req.session.state || "missing",
    userId: req.session.userId || "missing"
  });
}); 

// Root endpoint 
app.get("/", (req, res) => {
  res.json({
    message: "Social Media Automation API",
    status: "running",
    version: "1.0.0",
    endpoints: {
      user: "/user",
      social: "/social",
      facebook: "/social/facebook",
      twitter: "/auth/twitter",
      instagram: "/social/instagram",
      health: "/health"
    }
  });
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
  console.log(`🔗 Health: http://localhost:${process.env.PORT || 5000}/health`);
  console.log(`🔗 Twitter Auth: http://localhost:${process.env.PORT || 5000}/auth/twitter?userId=YOUR_USER_ID`);
  console.log(`🔗 Facebook Auth: http://localhost:${process.env.PORT || 5000}/social/facebook?userId=YOUR_USER_ID`);
  console.log(`🔗 Session Test: http://localhost:${process.env.PORT || 5000}/session-test`);
  console.log(`🐦 Twitter API: ${process.env.TWITTER_CLIENT_ID ? "✅ Configured" : "❌ Not Configured"}`);
  console.log(`📘 Facebook API: ${process.env.FB_APP_ID ? "✅ Configured" : "❌ Not Configured"}`);
});
