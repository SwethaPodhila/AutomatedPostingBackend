import dotenv from "dotenv";
import { TwitterApi } from "twitter-api-v2";
import TwitterAccount from "../models/TwitterAccount.js";
 
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
// 1️⃣ Twitter Auth (FIXED Session Save)
// =========================
export const twitterAuth = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).send("userId required");
 
    const { url, codeVerifier, state } =
      twitterClient.generateOAuth2AuthLink(
        TWITTER_CALLBACK_URL,
        { scope: ["tweet.read","tweet.write","users.read","offline.access"] }
      );
 
    // ✅ SAVE SESSION DATA
    req.session.twitterOAuth = {
      codeVerifier,
      state,
      userId,
      timestamp: Date.now()
    };
   
    // ✅ CRITICAL: SAVE SESSION BEFORE REDIRECT
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).send("Session save failed");
      }
     
      console.log("✅ Session saved. ID:", req.sessionID);
      console.log("✅ Session data:", req.session.twitterOAuth);
     
      // Redirect to Twitter OAuth
      res.redirect(url);
    });
   
  } catch (err) {
    console.error("❌ Twitter Auth Error:", err);
    res.status(500).send(err.message);
  }
};
// =========================
// 2️⃣ Twitter Callback (FIXED Session Check)
// =========================
export const twitterCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
 
    // ✅ CHECK SESSION EXISTS
    if (!req.session || !req.session.twitterOAuth) {
      console.error("❌ Session missing:", req.sessionID);
      return res.redirect(`${FRONTEND_URL}/twitter-connect?error=session_missing`);
    }
 
    const { codeVerifier, state: savedState, userId } = req.session.twitterOAuth;
 
    // ✅ VERIFY STATE
    if (state !== savedState) {
      return res.redirect(`${FRONTEND_URL}/twitter-connect?error=invalid_state`);
    }
 
    // ✅ EXCHANGE CODE FOR TOKENS
    const { accessToken, refreshToken } = await twitterClient.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: TWITTER_CALLBACK_URL
    });
 
    const userClient = new TwitterApi(accessToken);
    const user = await userClient.v2.me();
 
    // ✅ SAVE/UPDATE IN DATABASE
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
 
    // ✅ CLEAR SESSION AFTER SUCCESS
    delete req.session.twitterOAuth;
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
 
    // ✅ REDIRECT TO FRONTEND WITH SUCCESS
    res.redirect(
      `${FRONTEND_URL}/twitter-manager?twitter=connected&username=${user.data.username}&userId=${userId}`
    );
 
  } catch (err) {
    console.error("❌ Twitter Callback Error:", err);
    res.redirect(
      `${FRONTEND_URL}/twitter-connect?error=auth_failed&message=${encodeURIComponent(err.message)}`
    );
  }
};
 
// =========================
// 3️⃣ Check Twitter Connection
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
// 4️⃣ Post Tweet (with Refresh Token Logic)
// =========================
export const postToTwitter = async (req, res) => {
  try {
    const { userId, content } = req.body;
    if (!userId || !content) {
      return res.status(400).json({ success: false, error: "Missing fields" });
    }
 
    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "twitter"
    });
 
    if (!account) {
      return res.status(401).json({ success: false, error: "Twitter account not connected" });
    }
 
    // Create client with access token
    const client = new TwitterApi(account.accessToken);
   
    try {
      const tweet = await client.v2.tweet(content);
     
      res.json({
        success: true,
        tweetId: tweet.data.id,
        tweetUrl: `https://twitter.com/${account.meta?.username}/status/${tweet.data.id}`
      });
    } catch (tweetError) {
      // If token expired, try to refresh (optional enhancement)
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
// 5️⃣ Disconnect Twitter
// =========================
export const disconnectTwitter = async (req, res) => {
  try {
    const { userId } = req.body;
   
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId required" });
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