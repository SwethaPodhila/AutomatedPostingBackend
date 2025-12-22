// controllers/linkedin.controller.js - UPDATED WITH ANDROID DEEP LINK
import dotenv from "dotenv";
import axios from "axios";
import TwitterAccount from "../models/TwitterAccount.js";
import Post from "../models/Post.js";

dotenv.config();

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "https://automatedpostingbackend.onrender.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://automatedpostingsfrontend.onrender.com/";

// Android Deep Link Configuration
const ANDROID_DEEP_LINK = "com.wingspan.aimediahub://linkedin-callback";
const LINKEDIN_CALLBACK_URL = process.env.LINKEDIN_REDIRECT_URI || `${BACKEND_URL}/auth/linkedin/callback`;

// =========================
// 1️⃣ LinkedIn Auth (UPDATED WITH ANDROID SUPPORT)
// =========================
export const linkedinAuth = async (req, res) => {
  try {
    console.log("🔍 LinkedIn Auth Route Hit");
    console.log("📌 Request URL:", req.originalUrl);
    console.log("📌 Query Parameters:", JSON.stringify(req.query, null, 2));

    const userId = req.query.userId || req.query.userid || req.query.user_id;
    const platform = req.query.platform || 'web'; // 'web' or 'android'

    if (!userId) {
      console.error("❌ ERROR: No userId found in request!");
      return res.status(400).json({
        success: false,
        error: "userId parameter required",
        receivedParams: req.query,
        example: `${BACKEND_URL}/auth/linkedin?userId=your_user_id_here&platform=android`
      });
    }

    console.log("✅ UserId received:", userId, "Platform:", platform);

    // Generate OAuth state
    const state = Math.random().toString(36).substring(7);
    const scope = encodeURIComponent("profile email w_member_social openid");

    // LinkedIn OAuth URL
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_CALLBACK_URL)}&state=${state}&scope=${scope}`;

    // Store in session
    req.session.linkedinOAuth = {
      state,
      userId,
      platform,
      timestamp: Date.now()
    };

    // Save session
    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({
          success: false,
          error: "Session initialization failed"
        });
      }

      console.log("✅ Session saved successfully");

      // Handle different platforms
      if (platform === 'android') {
        console.log("📱 Android platform detected - redirecting to LinkedIn");
        return res.redirect(authUrl); // <- DIRECT REDIRECT TO LINKEDIN
      } else {
        // For web, redirect directly
        console.log("🔄 Redirecting to LinkedIn OAuth...");
        res.redirect(authUrl);
      }
    });

  } catch (err) {
    console.error("❌ LinkedIn Auth Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error during LinkedIn authentication"
    });
  }
};

// =========================
// 2️⃣ LinkedIn Callback (UPDATED WITH ANDROID DEEP LINK REDIRECT)
// =========================
export const linkedinCallback = async (req, res) => {
  try {
    console.log("🔗 LinkedIn Callback Received");
    console.log("📌 Full query:", req.query);

    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      console.error("❌ LinkedIn OAuth Error:", error_description);
      const errorUrl = `${FRONTEND_URL}/linkedin-connect?error=${error}&message=${encodeURIComponent(error_description)}`;
      return res.redirect(errorUrl);
    }

    // Check session exists
    if (!req.session || !req.session.linkedinOAuth) {
      console.error("❌ Session missing in callback");
      const errorUrl = `${FRONTEND_URL}/linkedin-connect?error=session_missing`;
      return res.redirect(errorUrl);
    }

    const { state: savedState, userId, platform } = req.session.linkedinOAuth;

    // Verify state
    if (state !== savedState) {
      console.error("❌ State mismatch");
      console.log("Received state:", state);
      console.log("Saved state:", savedState);
      const errorUrl = `${FRONTEND_URL}/linkedin-connect?error=invalid_state`;
      return res.redirect(errorUrl);
    }

    console.log("🔄 Exchanging code for access token...");
    console.log("📱 Platform:", platform);

    // Exchange code for token
    const tokenResponse = await axios.post(
      `https://www.linkedin.com/oauth/v2/accessToken?grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(LINKEDIN_CALLBACK_URL)}&client_id=${LINKEDIN_CLIENT_ID}&client_secret=${LINKEDIN_CLIENT_SECRET}`,
      {},
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = tokenResponse.data;
    console.log("✅ Access token received");

    // Get user profile
    console.log("🔄 Fetching LinkedIn profile...");
    const profileResponse = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'cache-control': 'no-cache'
        }
      }
    );

    const profile = profileResponse.data;
    console.log("✅ Profile received:", profile.name);

    // Save to database
    const savedAccount = await TwitterAccount.findOneAndUpdate(
      { user: userId, platform: "linkedin" },
      {
        user: userId,
        platform: "linkedin",
        providerId: profile.sub,
        accessToken: access_token,
        refreshToken: '',
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        loginPlatform: platform || 'web', // Store platform info
        scopes: ["profile", "email", "w_member_social", "openid"],
        meta: {
          twitterId: profile.sub,
          username: profile.name ? profile.name.toLowerCase().replace(/\s+/g, '.') : 'linkedin_user',
          name: profile.name || '',
          firstName: profile.given_name || '',
          lastName: profile.family_name || '',
          email: profile.email || '',
          profileImage: profile.picture || "https://cdn-icons-png.flaticon.com/512/174/174857.png",
          linkedinId: profile.sub,
          headline: profile.headline || ''
        }
      },
      { upsert: true, new: true }
    );

    console.log("✅ Account saved to database");

    // Clear session
    delete req.session.linkedinOAuth;
    req.session.save((err) => {
      if (err) console.error("Session clear error:", err);
    });

    // Handle different redirects based on platform
    if (platform === 'android') {
      // For Android: Redirect to deep link with success data
      console.log("📱 Redirecting to Android deep link");

      // Encode success data for deep link
      const successData = {
        linkedin: "connected",
        name: profile.name || 'User',
        userId: userId,
        email: profile.email || '',
        profileImage: profile.picture || "https://cdn-icons-png.flaticon.com/512/174/174857.png"
      };

      // Create deep link URL
      const deepLinkUrl = `${ANDROID_DEEP_LINK}?${new URLSearchParams(successData).toString()}`;
      console.log("🔗 Android Deep Link:", deepLinkUrl);

      // Redirect to deep link
      res.redirect(deepLinkUrl);
    } else {
      // For web: Redirect to frontend
      const redirectUrl = `${FRONTEND_URL}/linkedin-manager?linkedin=connected&name=${encodeURIComponent(profile.name || 'User')}&userId=${userId}`;
      console.log("🌐 Redirecting to web:", redirectUrl);
      res.redirect(redirectUrl);
    }

  } catch (err) {
    console.error("❌ LinkedIn Callback Error:", err.message);
    console.error("❌ Error details:", err.response?.data);

    const errorMessage = err.response?.data?.message || err.response?.data?.error_description || err.message;

    // Handle error redirect based on platform
    const { platform } = req.session?.linkedinOAuth || {};

    if (platform === 'android') {
      // Android error deep link
      const deepLinkUrl = `${ANDROID_DEEP_LINK}?error=auth_failed&message=${encodeURIComponent(errorMessage)}`;
      res.redirect(deepLinkUrl);
    } else {
      // Web error redirect
      res.redirect(
        `${FRONTEND_URL}/linkedin-connect?error=auth_failed&message=${encodeURIComponent(errorMessage)}`
      );
    }
  }
};

// =========================
// 3️⃣ Check LinkedIn Connection (UPDATED WITH PLATFORM INFO)
// =========================
export const checkLinkedInConnection = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId parameter is required"
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin",
    });

    if (!account) {
      return res.json({
        success: true,
        connected: false
      });
    }

    const isTokenValid = account.tokenExpiresAt > new Date();

    res.json({
      success: true,
      connected: isTokenValid,
      platform: account.loginPlatform || 'web',
      account: {
        name: account.meta?.name,
        firstName: account.meta?.firstName,
        lastName: account.meta?.lastName,
        username: account.meta?.username,
        email: account.meta?.email,
        headline: account.meta?.headline,
        profileImage: account.meta?.profileImage,
        linkedinId: account.meta?.linkedinId,
        connectedAt: account.createdAt,
        tokenExpiresAt: account.tokenExpiresAt,
        loginPlatform: account.loginPlatform
      }
    });

  } catch (err) {
    console.error("Check LinkedIn Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 4️⃣ Post to LinkedIn (UPDATED)
// =========================
export const postToLinkedIn = async (req, res) => {
  try {
    const { userId, content, visibility = "PUBLIC" } = req.body;

    if (!userId || !content) {
      return res.status(400).json({
        success: false,
        error: "userId and content are required"
      });
    }

    if (content.length > 3000) {
      return res.status(400).json({
        success: false,
        error: "Post cannot exceed 3000 characters"
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin"
    });

    if (!account) {
      return res.status(401).json({
        success: false,
        error: "LinkedIn account not connected"
      });
    }

    if (account.tokenExpiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: "Token expired. Please reconnect your LinkedIn account."
      });
    }

    // Prepare LinkedIn post
    const postPayload = {
      author: `urn:li:person:${account.providerId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: content
          },
          shareMediaCategory: "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    const postResponse = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      postPayload,
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );

    const postId = postResponse.data.id;
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

    // Save post to database
    try {
      const newPost = new Post({
        user: userId,
        platform: "linkedin",
        providerId: postId,
        content: content,
        postUrl: postUrl,
        postedAt: new Date(),
        status: "posted",
        accountInfo: {
          username: account.meta?.username || "",
          name: account.meta?.name || "",
          profileImage: account.meta?.profileImage || "",
          platformId: account.providerId,
          loginPlatform: account.loginPlatform || 'web'
        }
      });

      await newPost.save();
      console.log("✅ LinkedIn post saved to database:", postId);

    } catch (dbError) {
      console.error("❌ Error saving post to database:", dbError.message);
    }

    res.json({
      success: true,
      postId: postId,
      postUrl: postUrl,
      message: "Successfully posted to LinkedIn and saved to database!"
    });

  } catch (err) {
    console.error("Post to LinkedIn Error:", err.message);
    console.error("Post Error Details:", err.response?.data);

    let errorMessage = err.message;
    if (err.response?.data?.message) {
      errorMessage = err.response.data.message;
    } else if (err.response?.data?.error_description) {
      errorMessage = err.response.data.error_description;
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: err.response?.data
    });
  }
};

// =========================
// 5️⃣ Android Direct Auth (NEW - For direct Android integration)
// =========================
export const androidLinkedInAuth = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    // Generate OAuth state
    const state = Math.random().toString(36).substring(7);
    const scope = encodeURIComponent("profile email w_member_social openid");

    // LinkedIn OAuth URL for Android
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(LINKEDIN_CALLBACK_URL)}&state=${state}&scope=${scope}`;

    // Store in session
    req.session.linkedinOAuth = {
      state,
      userId,
      platform: 'android',
      timestamp: Date.now()
    };

    req.session.save((err) => {
      if (err) {
        console.error("❌ Session save error:", err);
        return res.status(500).json({
          success: false,
          error: "Session initialization failed"
        });
      }

      res.json({
        success: true,
        authUrl: authUrl,
        deepLink: ANDROID_DEEP_LINK,
        state: state,
        callbackUrl: LINKEDIN_CALLBACK_URL,
        message: "Open this URL in browser for LinkedIn authentication"
      });
    });

  } catch (err) {
    console.error("❌ Android LinkedIn Auth Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// =========================
// 6️⃣ Test Android Deep Link (NEW - For testing)
// =========================
export const testAndroidDeepLink = async (req, res) => {
  try {
    const { name = "Test User", userId = "test_user_123", success = "true" } = req.query;

    const testData = {
      linkedin: success === "true" ? "connected" : "failed",
      name: name,
      userId: userId,
      email: "test@example.com",
      profileImage: "https://cdn-icons-png.flaticon.com/512/174/174857.png",
      timestamp: new Date().toISOString()
    };

    const deepLinkUrl = `${ANDROID_DEEP_LINK}?${new URLSearchParams(testData).toString()}`;

    res.json({
      success: true,
      deepLink: deepLinkUrl,
      testData: testData,
      message: "Use this deep link to test Android app integration"
    });

  } catch (err) {
    console.error("❌ Test Android Deep Link Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 7️⃣ Get Platform Info (NEW)
// =========================
export const getPlatformInfo = async (req, res) => {
  try {
    res.json({
      success: true,
      platforms: {
        android: {
          deepLink: ANDROID_DEEP_LINK,
          supported: true,
          authEndpoint: `${BACKEND_URL}/auth/linkedin/android`,
          callbackUrl: LINKEDIN_CALLBACK_URL
        },
        web: {
          authEndpoint: `${BACKEND_URL}/auth/linkedin`,
          callbackUrl: LINKEDIN_CALLBACK_URL,
          redirectUrl: `${FRONTEND_URL}/linkedin-manager`
        }
      },
      config: {
        clientId: LINKEDIN_CLIENT_ID ? "Configured" : "Not configured",
        callbackUrl: LINKEDIN_CALLBACK_URL,
        backendUrl: BACKEND_URL,
        frontendUrl: FRONTEND_URL
      }
    });

  } catch (err) {
    console.error("❌ Get Platform Info Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 8️⃣ Disconnect LinkedIn (UPDATED)
// =========================
export const disconnectLinkedIn = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const result = await TwitterAccount.deleteOne({
      user: userId,
      platform: "linkedin"
    });

    res.json({
      success: true,
      message: "LinkedIn disconnected successfully",
      deletedCount: result.deletedCount
    });

  } catch (err) {
    console.error("LinkedIn Disconnect Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 9️⃣ Test LinkedIn Connection
// =========================
export const testLinkedInConnection = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId parameter is required"
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin",
    });

    if (!account) {
      return res.json({
        success: true,
        connected: false,
        message: "No LinkedIn account found for this user"
      });
    }

    // Test the token
    try {
      const testResponse = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'cache-control': 'no-cache'
          }
        }
      );

      return res.json({
        success: true,
        connected: true,
        tokenValid: true,
        platform: account.loginPlatform || 'web',
        profile: testResponse.data,
        account: {
          name: account.meta?.name,
          email: account.meta?.email,
          providerId: account.providerId,
          tokenExpiresAt: account.tokenExpiresAt,
          loginPlatform: account.loginPlatform
        }
      });

    } catch (tokenErr) {
      return res.json({
        success: true,
        connected: true,
        tokenValid: false,
        platform: account.loginPlatform || 'web',
        error: tokenErr.message,
        account: {
          name: account.meta?.name,
          providerId: account.providerId,
          tokenExpiresAt: account.tokenExpiresAt,
          loginPlatform: account.loginPlatform
        }
      });
    }

  } catch (err) {
    console.error("Test LinkedIn Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 🔟 Get User's LinkedIn Posts
// =========================
export const getLinkedInPosts = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId parameter is required"
      });
    }

    const posts = await Post.find({
      user: userId,
      platform: "linkedin"
    })
      .sort({ postedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      posts: posts,
      count: posts.length
    });

  } catch (err) {
    console.error("Get LinkedIn Posts Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 🔟 Get LinkedIn Profile (NEW)
// =========================
export const getLinkedInProfile = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId parameter is required"
      });
    }

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin",
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "LinkedIn account not found for this user"
      });
    }

    // Check if token is valid
    const isTokenValid = account.tokenExpiresAt > new Date();

    if (!isTokenValid) {
      return res.json({
        success: true,
        connected: false,
        message: "Token expired. Please reconnect your LinkedIn account.",
        profile: {
          name: account.meta?.name,
          email: account.meta?.email,
          profileImage: account.meta?.profileImage,
          linkedinId: account.meta?.linkedinId,
          headline: account.meta?.headline
        }
      });
    }

    // Try to fetch fresh profile data from LinkedIn
    try {
      const profileResponse = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'cache-control': 'no-cache'
          }
        }
      );

      const freshProfile = profileResponse.data;

      // Update database with fresh data
      await TwitterAccount.findOneAndUpdate(
        { _id: account._id },
        {
          'meta.name': freshProfile.name || account.meta?.name,
          'meta.firstName': freshProfile.given_name || account.meta?.firstName,
          'meta.lastName': freshProfile.family_name || account.meta?.lastName,
          'meta.email': freshProfile.email || account.meta?.email,
          'meta.profileImage': freshProfile.picture || account.meta?.profileImage,
          'meta.headline': freshProfile.headline || account.meta?.headline
        }
      );

      return res.json({
        success: true,
        connected: true,
        profile: {
          providerId: account.providerId,
          accessToken: account.accessToken,
          tokenExpiresAt: account.tokenExpiresAt,
          loginPlatform: account.loginPlatform || 'web',
          name: freshProfile.name,
          firstName: freshProfile.given_name,
          lastName: freshProfile.family_name,
          email: freshProfile.email,
          profileImage: freshProfile.picture,
          linkedinId: freshProfile.sub,
          headline: freshProfile.headline,
          userId: userId
        }
      });

    } catch (apiError) {
      // If API call fails, return cached profile data
      console.error("LinkedIn API Error:", apiError.message);

      return res.json({
        success: true,
        connected: true,
        cached: true,
        profile: {
          providerId: account.providerId,
          tokenExpiresAt: account.tokenExpiresAt,
          loginPlatform: account.loginPlatform || 'web',
          name: account.meta?.name,
          firstName: account.meta?.firstName,
          lastName: account.meta?.lastName,
          email: account.meta?.email,
          profileImage: account.meta?.profileImage,
          linkedinId: account.meta?.linkedinId,
          headline: account.meta?.headline,
          userId: userId
        }
      });
    }

  } catch (err) {
    console.error("Get LinkedIn Profile Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 11️⃣ Verify Android Session for LinkedIn (NEW)
// =========================

export const verifyAndroidSessionLinkedin = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId parameter is required"
      });
    }

    // Check if session exists (for LinkedIn OAuth flow)
    const hasSession = req.session && req.session.linkedinOAuth;

    if (!hasSession) {
      return res.json({
        success: true,
        sessionExists: false,
        message: "No active LinkedIn OAuth session"
      });
    }

    const { state, platform, timestamp } = req.session.linkedinOAuth;

    // Check if session is expired (30 minutes)
    const isExpired = Date.now() - timestamp > 30 * 60 * 1000;

    if (isExpired) {
      delete req.session.linkedinOAuth;
      req.session.save();

      return res.json({
        success: true,
        sessionExists: false,
        message: "LinkedIn OAuth session expired"
      });
    }

    res.json({
      success: true,
      sessionExists: true,
      platform: platform || 'web',
      state: state,
      userId: req.session.linkedinOAuth.userId,
      timestamp: timestamp
    });

  } catch (err) {
    console.error("Verify LinkedIn Android Session Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
