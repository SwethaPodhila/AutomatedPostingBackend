import dotenv from "dotenv";
dotenv.config();

import SocialAccount from "../models/socialAccount.js";
import { TwitterApi } from "twitter-api-v2";

const { 
  TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET,
  TWITTER_CALLBACK_URL,
  FRONTEND_URL 
} = process.env;

// Twitter client initialization
let twitterClient;
try {
  if (TWITTER_CLIENT_ID && TWITTER_CLIENT_SECRET) {
    twitterClient = new TwitterApi({
      clientId: TWITTER_CLIENT_ID,
      clientSecret: TWITTER_CLIENT_SECRET,
    });
    console.log("✅ Twitter OAuth 2.0 client initialized");
  } else {
    console.log("⚠️ Twitter credentials not found in .env");
  }
} catch (error) {
  console.error("❌ Twitter client init error:", error.message);
}

// Twitter OAuth start - UPDATED WITH FORCE PARAMETER
export const twitterAuth = async (req, res) => {
  try {
    console.log("===== TWITTER AUTH START =====");
    
    if (!twitterClient) {
      return res.status(500).json({ 
        success: false, 
        error: "Twitter client not configured" 
      });
    }

    const { userId, force } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: "User ID is required" 
      });
    }

    const callbackUrl = TWITTER_CALLBACK_URL;
    
    if (!callbackUrl) {
      return res.status(500).json({
        success: false,
        error: "Twitter callback URL not configured in .env"
      });
    }
    
    console.log("Generating Twitter OAuth for user:", userId);
    console.log("Force re-authorization:", force === 'true');
    
    // ✅ ADD force_login parameter if force=true
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
      callbackUrl,
      { 
        scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        // ✅ FORCE RE-AUTHORIZATION
        ...(force === 'true' && { force_login: true })
      }
    );

    // Store OAuth data in session
    req.session.twitterOAuth = {
      codeVerifier,
      state,
      userId
    };

    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({
          success: false,
          error: "Failed to save session"
        });
      }
      
      console.log("✅ Session saved, session ID:", req.sessionID);
      console.log("✅ OAuth URL generated:", url);
      
      res.json({ 
        success: true, 
        authUrl: url 
      });
    });
    
  } catch (error) {
    console.error("Twitter auth error:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to generate Twitter auth URL" 
    });
  }
};

// Twitter callback - UPDATED TO SAVE USERNAME FIELD
export const twitterCallback = async (req, res) => {
  try {
    console.log("===== TWITTER CALLBACK START =====");
    console.log("Session ID:", req.sessionID);
    console.log("Query params:", req.query);
    
    if (!twitterClient) {
      console.error("❌ Twitter client not configured");
      return res.redirect(`${FRONTEND_URL}/twitter-connect?error=twitter_not_configured`);
    }

    const { code, state } = req.query;

    if (!req.session.twitterOAuth) {
      console.error("❌ No Twitter OAuth data in session");
      return res.redirect(`${FRONTEND_URL}/twitter-connect?error=session_expired`);
    }

    const { twitterOAuth } = req.session;

    if (!state || !twitterOAuth.state || state !== twitterOAuth.state) {
      console.error("❌ State mismatch");
      return res.redirect(`${FRONTEND_URL}/twitter-connect?error=state_mismatch`);
    }

    if (!code || !twitterOAuth.codeVerifier) {
      console.error("❌ Missing code or codeVerifier");
      return res.redirect(`${FRONTEND_URL}/twitter-connect?error=missing_params`);
    }

    const { codeVerifier, userId } = twitterOAuth;

    console.log("🔄 Exchanging code for access token...");
    
    const { 
      client: loggedClient, 
      accessToken, 
      refreshToken,
      expiresIn 
    } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: TWITTER_CALLBACK_URL,
    });

    console.log("✅ Got Twitter tokens");
    
    const user = await loggedClient.v2.me({
      'user.fields': ['profile_image_url', 'name', 'username', 'id']
    });

    console.log("✅ Twitter user:", user.data.username);

    // ✅ UPDATED: Save with username field
    const twitterAccount = await SocialAccount.findOneAndUpdate(
      { 
        providerId: user.data.id, 
        platform: "twitter",
        user: userId 
      },
      {
        user: userId,
        platform: "twitter",
        providerId: user.data.id,
        accessToken: accessToken,
        refreshToken: refreshToken,
        username: user.data.username, // ✅ SAVE USERNAME DIRECTLY
        scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        meta: {
          username: user.data.username,
          name: user.data.name,
          profileImage: user.data.profile_image_url,
          expiresIn: expiresIn,
          authenticatedAt: new Date(),
          twitterId: user.data.id
        }
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Twitter connected: @${user.data.username}`);
    console.log(`✅ Data saved to SocialAccount database`);

    // Clear session
    delete req.session.twitterOAuth;

    // Redirect to Twitter Manager
    res.redirect(`${FRONTEND_URL}/twitter-manager?twitter=connected&username=${user.data.username}`);
    
  } catch (error) {
    console.error("❌ Twitter callback error:", error.message);
    console.error("Error details:", error);
    
    // Clear session on error
    if (req.session.twitterOAuth) {
      delete req.session.twitterOAuth;
    }
    
    res.redirect(`${FRONTEND_URL}/twitter-connect?error=auth_failed`);
  }
};

// Post to Twitter - UPDATED (No redirect)
export const postToTwitter = async (req, res) => {
  try {
    const { userId, content } = req.body;

    if (!userId || !content) {
      return res.status(400).json({
        success: false,
        error: "User ID and content are required"
      });
    }

    if (content.length > 280) {
      return res.status(400).json({
        success: false,
        error: "Tweet cannot exceed 280 characters"
      });
    }

    const twitterAccount = await SocialAccount.findOne({
      user: userId,
      platform: "twitter"
    });

    if (!twitterAccount) {
      return res.status(401).json({
        success: false,
        error: "Twitter account not connected"
      });
    }

    if (!twitterAccount.accessToken) {
      return res.status(401).json({
        success: false,
        error: "Twitter access token not found"
      });
    }

    const userTwitterClient = new TwitterApi(twitterAccount.accessToken);
    const tweet = await userTwitterClient.v2.tweet(content);
    
    // ✅ RETURN ONLY JSON, NO REDIRECT
    res.json({
      success: true,
      message: `Tweet posted successfully!`,
      tweetId: tweet.data.id,
      tweetUrl: `https://twitter.com/${twitterAccount.username}/status/${tweet.data.id}`,
      username: twitterAccount.username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("Twitter post error:", error);
    
    let errorMsg = error.message;
    if (error.code === 403) {
      errorMsg = 'App does not have write permissions.';
    }
    if (error.code === 401) {
      errorMsg = 'Twitter access token expired. Please reconnect.';
    }

    res.status(500).json({
      success: false,
      error: errorMsg
    });
  }
};

// Get Twitter account info - UPDATED
export const getTwitterAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log("🔍 Getting Twitter account for user:", userId);

    const twitterAccount = await SocialAccount.findOne({
      user: userId,
      platform: "twitter"
    });

    if (!twitterAccount) {
      console.log("❌ No Twitter account found for user:", userId);
      return res.json({
        success: true,
        connected: false,
        message: "Twitter account not connected"
      });
    }

    console.log("✅ Found Twitter account:", twitterAccount.username);
    
    res.json({
      success: true,
      connected: true,
      account: {
        username: twitterAccount.username || twitterAccount.meta?.username,
        name: twitterAccount.meta?.name || twitterAccount.username,
        profileImage: twitterAccount.meta?.profileImage || `https://unavatar.io/twitter/${twitterAccount.username}`,
        connectedAt: twitterAccount.createdAt
      }
    });
    
  } catch (error) {
    console.error("Get Twitter account error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get Twitter account info"
    });
  }
};

// Twitter logout/disconnect - UPDATED
export const disconnectTwitter = async (req, res) => {
  try {
    const { userId } = req.body;

    const result = await SocialAccount.deleteMany({
      user: userId,
      platform: "twitter"
    });

    console.log(`✅ Disconnected Twitter for user ${userId}. Deleted: ${result.deletedCount} accounts`);
    
    res.json({
      success: true,
      message: "Twitter account disconnected successfully",
      deletedCount: result.deletedCount
    });
    
  } catch (error) {
    console.error("Disconnect Twitter error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to disconnect Twitter account"
    });
  }
};