import dotenv from "dotenv";

import { TwitterApi } from "twitter-api-v2";

import TwitterAccount from "../models/TwitterAccount.js";

import Post from "../models/Post.js";
 
dotenv.config();
 
// Twitter credentials

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;

const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;

const BACKEND_URL = "https://automatedpostingbackend.onrender.com";

const FRONTEND_URL = "https://automatedpostingsfrontend.onrender.com";

const TWITTER_CALLBACK_URL = `${BACKEND_URL}/auth/twitter/callback`;
 
const twitterClient = new TwitterApi({

  clientId: TWITTER_CLIENT_ID,

  clientSecret: TWITTER_CLIENT_SECRET,

});
 
// =========================

// 1️⃣ Twitter Auth - SIMPLE VERSION

// =========================

export const twitterAuth = async (req, res) => {

  try {

    const { userId } = req.query;

    if (!userId) {

      return res.status(400).send("userId required");

    }
 
    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(

      TWITTER_CALLBACK_URL,

      { scope: ["tweet.read","tweet.write","users.read","offline.access"] }

    );
 
    // Store in memory (simple approach)

    global.twitterOAuthStates = global.twitterOAuthStates || {};

    global.twitterOAuthStates[state] = {

      codeVerifier,

      userId,

      timestamp: Date.now()

    };
 
    console.log(`✅ OAuth state stored: ${state} for user: ${userId}`);

    // Just redirect to Twitter - NO HTML

    res.redirect(url);
 
  } catch (err) {

    console.error("❌ Twitter Auth Error:", err);

    res.status(500).send(err.message);

  }

};
 
// =========================

// 2️⃣ Twitter Callback - SIMPLE VERSION

// =========================

export const twitterCallback = async (req, res) => {

  try {

    const { code, state } = req.query;
 
    console.log("📱 Twitter Callback received:", { code: code ? "YES" : "NO", state });
 
    // Get OAuth data from memory

    const oauthData = global.twitterOAuthStates?.[state];

    if (!oauthData) {

      console.error("❌ OAuth data missing for state:", state);

      console.error("Available states:", Object.keys(global.twitterOAuthStates || {}));

      // Simple error response

      return res.send(`
<script>

          alert("Session expired. Please try again.");

          window.close();
</script>

      `);

    }
 
    const { codeVerifier, userId } = oauthData;
 
    // Clean up

    delete global.twitterOAuthStates[state];
 
    // Exchange code for tokens

    const { accessToken, refreshToken } = await twitterClient.loginWithOAuth2({

      code,

      codeVerifier,

      redirectUri: TWITTER_CALLBACK_URL

    });
 
    const userClient = new TwitterApi(accessToken);

    const user = await userClient.v2.me();
 
    console.log(`✅ Twitter user authenticated: ${user.data.username}`);
 
    // Save to database

    await TwitterAccount.findOneAndUpdate(

      { user: userId, platform: "twitter" },

      {

        user: userId,

        platform: "twitter",

        providerId: user.data.id,

        accessToken,

        refreshToken,

        scopes: ["tweet.read","tweet.write","users.read","offline.access"],

        meta: {

          twitterId: user.data.id,

          username: user.data.username,

          name: user.data.name

        }

      },

      { upsert: true, new: true }

    );
 
    // Generate simple session ID for Android

    const sessionId = `tw_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
 
    // Store session in database

    await TwitterAccount.findOneAndUpdate(

      { user: userId, platform: "twitter" },

      { $set: { androidSessionId: sessionId } }

    );
 
    console.log(`✅ Generated session ID: ${sessionId} for Android`);
 
    // For Android - just pass data, NO HTML redirect

    // Android Custom Tabs will catch this URL

    const deepLink = `aimediahub://twitter-callback?session_id=${sessionId}&status=success&username=${user.data.username}&twitter_id=${user.data.id}`;

    // Simple redirect - Android will intercept this

    res.redirect(deepLink);
 
  } catch (err) {

    console.error("❌ Twitter Callback Error:", err);

    // Simple error redirect

    res.redirect(`aimediahub://twitter-callback?status=error&message=${encodeURIComponent(err.message)}`);

  }

};
 
// =========================

// 3️⃣ Verify Android Session (for Android app to call)

// =========================

export const verifyAndroidSession = async (req, res) => {

  try {

    const { session_id } = req.query;

    if (!session_id) {

      return res.status(400).json({ 

        success: false, 

        error: "session_id is required" 

      });

    }
 
    console.log(`🔍 Verifying session: ${session_id}`);
 
    // Find account with this session ID

    const account = await TwitterAccount.findOne({

      androidSessionId: session_id,

      platform: "twitter"

    });
 
    if (!account) {

      console.error(`❌ Session not found: ${session_id}`);

      return res.status(404).json({

        success: false,

        error: "Session not found or expired"

      });

    }
 
    console.log(`✅ Session verified for user: ${account.user}`);
 
    // Clear the session ID after verification

    await TwitterAccount.updateOne(

      { _id: account._id },

      { $unset: { androidSessionId: "" } }

    );
 
    res.json({

      success: true,

      account: {

        userId: account.user,

        twitterId: account.meta?.twitterId,

        username: account.meta?.username,

        name: account.meta?.name,

        connectedAt: account.createdAt

      }

    });
 
  } catch (err) {

    console.error("❌ Verify Android Session Error:", err);

    res.status(500).json({ 

      success: false, 

      error: err.message 

    });

  }

};
 
// =========================

// 4️⃣ Check Twitter Connection

// =========================

export const checkTwitterConnection = async (req, res) => {

  try {

    const { userId } = req.query;

    if (!userId) {

      return res.status(400).json({ success: false, error: "userId required" });

    }
 
    const account = await TwitterAccount.findOne({

      user: userId,

      platform: "twitter",

    });
 
    if (!account) return res.json({ success: true, connected: false });
 
    res.json({

      success: true,

      connected: true,

      account: {

        username: account.meta?.username,

        name: account.meta?.name,

        connectedAt: account.createdAt,

      }

    });
 
  } catch (err) {

    res.status(500).json({ success: false, error: err.message });

  }

};
 
// =========================

// 5️⃣ Post Tweet

// =========================

export const postToTwitter = async (req, res) => {

  try {

    const { userId, content } = req.body;

    if (!userId || !content) {

      return res.status(400).json({ 

        success: false, 

        error: "userId and content required" 

      });

    }
 
    const account = await TwitterAccount.findOne({

      user: userId,

      platform: "twitter"

    });
 
    if (!account) {

      return res.status(401).json({ 

        success: false, 

        error: "Twitter account not connected" 

      });

    }
 
    // Create client with access token

    const client = new TwitterApi(account.accessToken);

    try {

      const tweet = await client.v2.tweet(content);

      const tweetId = tweet.data.id;

      const tweetUrl = `https://twitter.com/${account.meta?.username}/status/${tweetId}`;

      // Save post to database

      try {

        const newPost = new Post({

          user: account.user,

          platform: "twitter",

          providerId: tweetId,

          content: content,

          postUrl: tweetUrl,

          postedAt: new Date(),

          status: "posted",

          accountInfo: {

            username: account.meta?.username || "",

            name: account.meta?.name || "",

            profileImage: "",

            platformId: account.providerId

          }

        });
 
        await newPost.save();

        console.log("✅ Twitter post saved to database:", tweetId);

      } catch (dbError) {

        console.error("❌ Error saving tweet to database:", dbError.message);

      }
 
      res.json({

        success: true,

        tweetId: tweetId,

        tweetUrl: tweetUrl,

        message: "Successfully tweeted!"

      });

    } catch (tweetError) {

      console.error("Tweet error:", tweetError);

      throw tweetError;

    }
 
  } catch (err) {

    console.error("❌ Post to Twitter Error:", err);

    res.status(500).json({

      success: false,

      error: err.message || "Failed to post tweet"

    });

  }

};
 
// =========================

// 6️⃣ Disconnect Twitter

// =========================

export const disconnectTwitter = async (req, res) => {

  try {

    const { userId } = req.body;

    if (!userId) {

      return res.status(400).json({ 

        success: false, 

        error: "userId required" 

      });

    }
 
    const result = await TwitterAccount.deleteOne({

      user: userId,

      platform: "twitter"

    });
 
    res.json({

      success: true,

      message: "Twitter disconnected successfully",

      deletedCount: result.deletedCount

    });
 
  } catch (err) {

    console.error("❌ Disconnect Error:", err);

    res.status(500).json({ success: false, error: err.message });

  }
};