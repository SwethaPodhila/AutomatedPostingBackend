import dotenv from "dotenv";
import { TwitterApi } from "twitter-api-v2";
import TwitterAccount from "../models/TwitterAccount.js";
import Post from "../models/Post.js";

dotenv.config();

const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "https://automatedpostingbackend.onrender.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://automatedpostingsfrontend.onrender.com";
const TWITTER_CALLBACK_URL = `${BACKEND_URL}/auth/twitter/callback`;

// Twitter client for getting new tokens
const twitterClient = new TwitterApi({
  clientId: TWITTER_CLIENT_ID,
  clientSecret: TWITTER_CLIENT_SECRET,
});

// =========================
// HELPER: REFRESH TOKEN
// =========================
const refreshAccessToken = async (refreshToken) => {
  try {
    console.log("🔄 Attempting to refresh access token...");
    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn
    } = await twitterClient.refreshOAuth2Token(refreshToken);
    
    console.log("✅ Token refreshed successfully");
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn
    };
  } catch (refreshError) {
    console.error("❌ Token refresh failed:", refreshError.message);
    if (refreshError.code === 400) {
      throw new Error("Refresh token invalid or expired. Please reconnect your Twitter account.");
    }
    throw new Error(`Token refresh failed: ${refreshError.message}`);
  }
};
// =========================
// HELPER: GET VALID CLIENT
// =========================
const getValidTwitterClient = async (account) => {
  try {
    let accessToken = account.accessToken;
    let refreshToken = account.refreshToken;

    // First, try with current token
    const client = new TwitterApi(accessToken);

    try {
      await client.v2.me();
      console.log("✅ Token is valid");
      return { client, accessToken, refreshToken };
    } catch (tokenError) {
      console.log("⚠️ Token appears invalid, error:", tokenError.message);
      
      // If we have a refresh token, try to refresh
      if (refreshToken) {
        console.log("🔄 Attempting token refresh...");
        const newTokens = await refreshAccessToken(refreshToken);
        
        // Update in database
        await TwitterAccount.findByIdAndUpdate(account._id, {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + (newTokens.expiresIn * 1000)),
          updatedAt: new Date()
        });

        console.log("✅ Token refreshed and saved to database");
        return { 
          client: new TwitterApi(newTokens.accessToken), 
          accessToken: newTokens.accessToken, 
          refreshToken: newTokens.refreshToken 
        };
      } else {
        console.error("❌ No refresh token available");
        throw new Error("No refresh token available. Please reconnect your Twitter account.");
      }
    }
  } catch (error) {
    console.error("❌ Error getting valid client:", error.message);
    throw error;
  }
};
// =========================
// 1️⃣ TWITTER AUTH
// =========================
export const twitterAuth = async (req, res) => {
  try {
    const { userId, platform } = req.query;
    if (!userId) return res.status(400).send("userId required");

    console.log(`🔥 Twitter Auth Request: userId=${userId}, platform=${platform || 'web'}`);
    let loginPlatform = platform || "web";

    const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
      TWITTER_CALLBACK_URL,
      {
        scope: ["tweet.read", "tweet.write", "users.read", "offline.access"]
      }
    );

    // Save with platform
    await TwitterAccount.findOneAndUpdate(
      { user: userId, platform: "twitter" },
      {
        user: userId,
        platform: "twitter",
        oauthState: state,
        oauthCodeVerifier: codeVerifier,
        oauthCreatedAt: new Date(),
        loginPlatform: loginPlatform,
        androidSessionId: null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`✅ OAuth saved for ${loginPlatform} flow`);
    res.redirect(url);

  } catch (err) {
    console.error("❌ Auth Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 2️⃣ TWITTER CALLBACK
// =========================
export const twitterCallback = async (req, res) => {
  console.log("🚨 Twitter Callback Triggered");
  try {
    const { code, state, error: twitterError } = req.query;
    
    if (twitterError) {
      console.error("❌ Twitter auth error:", twitterError);
      return sendErrorResponse(res, `Twitter authentication failed: ${twitterError}`, "web");
    }
    
    if (!code || !state) return res.status(400).send("Missing code or state");

    // Find account
    const account = await TwitterAccount.findOne({
      oauthState: state,
      platform: "twitter"
    });

    if (!account) {
      console.error("❌ Session expired - No account found for state:", state);
      return sendErrorResponse(res, "Session expired. Please try again.", "web");
    }

    console.log(`✅ Account Found: ${account.user}, Platform: ${account.loginPlatform || 'web'}`);
    const { oauthCodeVerifier, user: userId, loginPlatform } = account;

    // Get access token
    try {
      const { accessToken, refreshToken, expiresIn } = await twitterClient.loginWithOAuth2({
        code,
        codeVerifier: oauthCodeVerifier,
        redirectUri: TWITTER_CALLBACK_URL
      });

      console.log(`✅ Tokens received. Expires in: ${expiresIn} seconds`);

      // Create client and get user info
      const userClient = new TwitterApi(accessToken);
      const user = await userClient.v2.me({
        "user.fields": ["profile_image_url", "username", "name", "id"]
      });

      console.log(`✅ Twitter User: @${user.data.username} (${user.data.id})`);

      // Prepare update data
      const updateData = {
        providerId: user.data.id,
        accessToken,
        refreshToken,
        tokenExpiresAt: new Date(Date.now() + (expiresIn * 1000)),
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        meta: {
          twitterId: user.data.id,
          username: user.data.username,
          name: user.data.name,
          profileImageUrl: user.data.profile_image_url
        },
        oauthState: null,
        oauthCodeVerifier: null,
        oauthCreatedAt: null,
        updatedAt: new Date(),
        lastTokenRefresh: new Date()
      };

      // ANDROID: Create Session ID
      let sessionId = null;
      if (loginPlatform === "android") {
        sessionId = `tw_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        updateData.androidSessionId = sessionId;
        console.log(`📱 ANDROID SESSION CREATED: ${sessionId}`);
      }

      // Save to database
      await TwitterAccount.findByIdAndUpdate(account._id, updateData);

      // Redirect based on platform
      return handleRedirect(res, loginPlatform || "web", user.data, userId, sessionId, accessToken);

    } catch (authError) {
      console.error("❌ Auth token exchange failed:", authError.message);
      return sendErrorResponse(res, `Authentication failed: ${authError.message}`, loginPlatform || "web");
    }

  } catch (err) {
    console.error("❌ Callback Error:", err);
    const account = await TwitterAccount.findOne({ oauthState: req.query.state });
    const platform = account?.loginPlatform || "web";
    return sendErrorResponse(res, err.message, platform);
  }
};

// =========================
// 3️⃣ POST TWEET (TEXT ONLY – FIXED)
// =========================
export const publishTweet = async (req, res) => {
  try {
    const { userId, content, scheduleTime } = req.body;

    if (!userId || !content) {
      return res.status(400).json({
        success: false,
        error: "userId and content are required"
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "twitter"
    });

    if (!account) {
      return res.status(401).json({
        success: false,
        error: "Twitter not connected"
      });
    }

    // Save post first
    const post = await Post.create({
      user: userId,
      platform: "twitter",
      content,
      status: scheduleTime ? "scheduled" : "pending",
      scheduledTime: scheduleTime || null
    });

    // 🔁 COMMON POST FUNCTION
    const postTweetNow = async () => {
      const freshAccount = await TwitterAccount.findById(account._id);
      const { client } = await getValidTwitterClient(freshAccount);

      const tweet = await client.v2.tweet({ text: content });

      const tweetUrl = `https://twitter.com/${freshAccount.meta?.username}/status/${tweet.data.id}`;

      await Post.findByIdAndUpdate(post._id, {
        providerId: tweet.data.id,
        postUrl: tweetUrl,
        status: "posted",
        postedAt: new Date()
      });

      return tweetUrl;
    };

    // ⏰ SCHEDULED POST
    if (scheduleTime) {
      const runAt = new Date(scheduleTime);
      if (runAt <= new Date()) {
        return res.status(400).json({
          success: false,
          error: "Schedule time must be future"
        });
      }

      schedule.scheduleJob(runAt, async () => {
        try {
          await postTweetNow();
        } catch (err) {
          await Post.findByIdAndUpdate(post._id, {
            status: "failed",
            error: err.message
          });
        }
      });

      return res.json({
        success: true,
        message: "Tweet scheduled successfully",
        postId: post._id
      });
    }

    // 🚀 IMMEDIATE POST
    const tweetUrl = await postTweetNow();

    res.json({
      success: true,
      message: "Tweet posted successfully",
      postUrl: tweetUrl
    });

  } catch (err) {
    console.error("❌ Tweet Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 4️⃣ AI CAPTION GENERATION (FIXED)
// =========================
export const generateTwitterCaption = async (req, res) => {
  try {
    console.log("🤖 AI GENERATE CAPTION FOR TWITTER");
    const { prompt } = req.body;
    
    if (!prompt || prompt.trim() === "") {
      return res.status(400).json({ 
        success: false,
        error: "Prompt is required" 
      });
    }

    // If no API key, provide fallback
    if (!process.env.OPENROUTER_KEY) {
      console.warn("⚠️ OPENROUTER_KEY not set, using fallback");
      const fallbackCaption = `${prompt} - Sharing my thoughts! #${prompt.replace(/\s+/g, '').substring(0, 10)}`;
      return res.json({ 
        success: true,
        text: fallbackCaption
      });
    }

    const apiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Create a catchy Twitter tweet (max 280 characters) about: "${prompt}". Include relevant hashtags.`
          }
        ],
        max_tokens: 100
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": FRONTEND_URL,
          "X-Title": "Automated Posting App"
        },
        timeout: 30000
      }
    );

    const caption = apiRes.data.choices[0]?.message?.content || "";
    console.log("✅ AI caption generated:", caption.substring(0, 50) + "...");
    
    res.json({ 
      success: true,
      text: caption.trim() 
    });
    
  } catch (err) {
    console.error("❌ AI Generation Error:", err.message);
    
    // Always return a response even if AI fails
    const fallbackCaption = `${req.body.prompt || "Topic"} - Sharing my perspective! #Thoughts`;
    res.json({ 
      success: true,
      text: fallbackCaption,
      note: "AI service temporary unavailable, using fallback"
    });
  }
};

// =========================
// 5️⃣ GET TWITTER POSTS
// =========================
export const getTwitterPosts = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId required"
      });
    }

    const posts = await Post.find({
      user: userId,
      platform: "twitter"
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      posts: posts,
      count: posts.length
    });

  } catch (err) {
    console.error("Get Posts Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 6️⃣ DELETE SCHEDULED TWEET
// =========================
export const deleteScheduledTweet = async (req, res) => {
  try {
    const { postId, userId } = req.body;
    
    if (!postId || !userId) {
      return res.status(400).json({
        success: false,
        error: "postId and userId required"
      });
    }
    
    const post = await Post.findOne({
      _id: postId,
      user: userId,
      platform: "twitter"
    });
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found"
      });
    }
    
    if (post.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        error: "Only scheduled tweets can be deleted"
      });
    }
    
    // Delete from database
    await Post.findByIdAndDelete(postId);
    
    res.json({
      success: true,
      message: "Scheduled tweet deleted successfully"
    });
    
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 7️⃣ CHECK CONNECTION
// =========================
export const checkTwitterConnection = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({
      success: false,
      error: "userId required"
    });

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "twitter",
    });

    if (!account) {
      return res.json({
        success: true,
        connected: false,
        message: "Twitter account not connected"
      });
    }

    // Try to validate the token
    let isValid = false;
    let error = null;

    try {
      const client = new TwitterApi(account.accessToken);
      await client.v2.me();
      isValid = true;
    } catch (tokenError) {
      error = tokenError.message;
      isValid = false;
    }

    res.json({
      success: true,
      connected: isValid,
      isValid: isValid,
      error: error,
      account: {
        username: account.meta?.username,
        name: account.meta?.name,
        connectedAt: account.createdAt,
        needsReconnect: !isValid
      }
    });

  } catch (err) {
    console.error("Check Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 8️⃣ VERIFY ANDROID SESSION
// =========================
export const verifyAndroidSession = async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({
      success: false,
      error: "session_id required"
    });

    console.log(`🔍 Verifying Session: ${session_id}`);

    // Find account with this session ID
    const account = await TwitterAccount.findOne({
      androidSessionId: session_id,
      platform: "twitter"
    });

    if (!account) {
      console.error(`❌ Session not found: ${session_id}`);
      return res.status(404).json({
        success: false,
        error: "Session expired or invalid",
        code: "SESSION_EXPIRED"
      });
    }

    console.log(`✅ Session Verified: ${account.user} (@${account.meta?.username})`);

    // Clear session ID after verification
    await TwitterAccount.findByIdAndUpdate(account._id, {
      androidSessionId: null
    });

    res.json({
      success: true,
      account: {
        userId: account.user,
        twitterId: account.meta?.twitterId,
        username: account.meta?.username,
        name: account.meta?.name,
        connectedAt: account.createdAt,
        accessToken: account.accessToken
      }
    });

  } catch (err) {
    console.error("❌ Verify Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 9️⃣ DISCONNECT
// =========================
export const disconnectTwitter = async (req, res) => {
  try {
    const { userId } = req.body;
    console.log("🔴 Disconnect request received, userId:", userId);
   
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId required in request body"
      });
    }
 
    // Find and delete the account
    const result = await TwitterAccount.deleteOne({
      user: userId,
      platform: "twitter"
    });
 
    console.log("✅ Delete result:", result);
 
    res.json({
      success: true,
      message: "Twitter account disconnected successfully",
      deletedCount: result.deletedCount
    });
 
  } catch (err) {
    console.error("❌ Disconnect Error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to disconnect Twitter account"
    });
  }
};

// =========================
// 🔟 GET TWITTER PROFILE
// =========================
export const getTwitterProfile = async (req, res) => {
  try {
    const { userId } = req.query;
 
    console.log("🔍 Profile request received, userId:", userId);
 
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId query parameter required (e.g., ?userId=123)",
        connected: false
      });
    }
 
    // Find account in database
    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "twitter"
    });
 
    if (!account) {
      console.log("❌ Account not found for userId:", userId);
      return res.status(200).json({
        success: true,
        connected: false,
        message: "Twitter account not connected",
        profile: null
      });
    }
 
    if (!account.accessToken) {
      return res.status(200).json({
        success: true,
        connected: false,
        message: "Access token missing for this account",
        profile: null
      });
    }
 
    // Try to get fresh data
    let profileImageUrl = account.meta?.profileImageUrl || null;
    let freshUserData = null;
    let tokenStatus = "unknown";
 
    try {
      const userClient = new TwitterApi(account.accessToken);
      const user = await userClient.v2.me({
        "user.fields": ["profile_image_url", "username", "name", "id"]
      });
      freshUserData = user.data;
      profileImageUrl = user.data.profile_image_url || profileImageUrl;
      tokenStatus = "valid";
      console.log("✅ Fresh Twitter data fetched for:", user.data.username);
 
    } catch (apiError) {
      console.error("❌ Error fetching from Twitter API:", apiError.message);
      if (account.meta) {
        freshUserData = account.meta;
        profileImageUrl = account.meta.profileImageUrl || profileImageUrl;
      }
      tokenStatus = "invalid_or_expired";
    }
 
    // Prepare profile image URLs
    let profileImageUrls = {};
    if (profileImageUrl) {
      const baseUrl = profileImageUrl.replace('_normal', '');
      profileImageUrls = {
        normal: profileImageUrl,
        bigger: `${baseUrl}_bigger`,
        mini: `${baseUrl}_mini`,
        original: baseUrl
      };
    }
 
    return res.json({
      success: true,
      connected: true,
      message: "Twitter account is connected",
      tokenDetails: {
        status: tokenStatus,
        hasAccessToken: !!account.accessToken,
        hasRefreshToken: !!account.refreshToken,
        tokenExpiresAt: account.tokenExpiresAt,
        lastRefresh: account.lastTokenRefresh
      },
      profile: {
        userId: account.user,
        twitterId: freshUserData?.id || account.meta?.twitterId || account.providerId,
        username: freshUserData?.username || account.meta?.username,
        name: freshUserData?.name || account.meta?.name,
        profileImageUrl: profileImageUrl,
        profileImageUrls: profileImageUrls,
        connectedAt: account.createdAt,
        updatedAt: account.updatedAt
      }
    });
 
  } catch (err) {
    console.error("❌ Profile Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
      connected: false
    });
  }
};

// =========================
// HELPER FUNCTIONS
// =========================
const handleRedirect = (res, platform, userData, userId, sessionId, accessToken) => {
  console.log(`🔄 Redirecting: ${platform.toUpperCase()} flow`);

  // ANDROID: Send Direct Deep Link Redirect
  if (platform === "android" && sessionId) {
    const deepLink =
      `com.wingspan.aimediahub://twitter-callback` +
      `?session_id=${sessionId}` +
      `&status=success` +
      `&username=${encodeURIComponent(userData.username)}` +
      `&twitter_id=${userData.id}` +
      `&user_id=${userId}`;

    console.log(`🔗 Android Deep Link Created: ${deepLink}`);
    return res.redirect(deepLink);
  }

  // WEB: Normal Redirect
  const webRedirect =
    "https://automatedpostingsfrontend.onrender.com/twitter-manager" + 
    `?twitter=connected` +
    `&username=${encodeURIComponent(userData.username)}` +
    `&user_id=${userId}`;

  console.log(`🌐 Web Redirect: ${webRedirect}`);
  return res.redirect(webRedirect);
};

const sendErrorResponse = (res, error, platform) => {
  console.log(`❌ ${platform.toUpperCase()} Error: ${error}`);

  if (platform === "android") {
    const errorLink = `com.wingspan.aimediahub://twitter-callback?status=error&error=${encodeURIComponent(error)}`;
    return res.redirect(errorLink);
  }

  // Web error
  const webError = `https://automatedpostingsfrontend.onrender.com/twitter-connect?error=${encodeURIComponent(error)}`;
  return res.redirect(webError);
};