import dotenv from "dotenv";
import axios from "axios";
import TwitterAccount from "../models/TwitterAccount.js";
import Post from "../models/Post.js";
import schedule from "node-schedule";
import cloudinary, { uploadImageToCloud } from "../config/cloudinary.js"; // ✅ Import from single file
import fs from 'fs'; // ✅ ADD THIS LINE
import path from 'path'; // ✅ ADD THIS LINE (optional but useful)

dotenv.config();

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "https://automatedpostingbackend.onrender.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://automatedpostingsfrontend.onrender.com";

// Android Deep Link Configuration
const ANDROID_DEEP_LINK = "com.wingspan.aimediahub://linkedin-callback";
const LINKEDIN_CALLBACK_URL = process.env.LINKEDIN_REDIRECT_URI || `${BACKEND_URL}/auth/linkedin/callback`;

// =========================
// 1️⃣ LinkedIn Auth (SAME AS BEFORE - KEEP)
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

      if (platform === 'android') {
        console.log("📱 Android platform detected - redirecting to LinkedIn");
        return res.redirect(authUrl);
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
// 2️⃣ LinkedIn Callback (SAME AS BEFORE - KEEP)
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
// 3️⃣ Check LinkedIn Connection (SAME AS BEFORE - KEEP)
// =========================
export const checkLinkedInConnection = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({
      success: false,
      error: "userId required"
    });

    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin",
    });

    if (!account) {
      return res.json({
        success: true,
        connected: false,
        message: "LinkedIn account not connected"
      });
    }

    // Try to validate the token
    let isValid = false;
    let error = null;

    try {
      const response = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'cache-control': 'no-cache'
          }
        }
      );
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
        name: account.meta?.name,
        firstName: account.meta?.firstName,
        lastName: account.meta?.lastName,
        username: account.meta?.username,
        email: account.meta?.email,
        headline: account.meta?.headline,
        profileImage: account.meta?.profileImage,
        linkedinId: account.meta?.linkedinId,
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
// 4️⃣ POST TO LINKEDIN (UPDATED - FIXED CLOUDINARY)
// =========================
export const postToLinkedIn = async (req, res) => {
  try {
    console.log("🚀 LinkedIn Post Request Received");
    console.log("📝 Request body:", req.body);
    console.log("📁 File info:", req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    } : "No file");

    const { userId, content, scheduleTime, visibility = "PUBLIC" } = req.body;
    const file = req.file;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId required"
      });
    }

    if (!content && !file) {
      return res.status(400).json({
        success: false,
        error: "Content or media is required"
      });
    }

    if (content && content.length > 3000) {
      return res.status(400).json({
        success: false,
        error: "Post cannot exceed 3000 characters"
      });
    }

    // Get LinkedIn account
    const account = await TwitterAccount.findOne({
      user: userId,
      platform: "linkedin"
    });

    if (!account) {
      return res.status(401).json({
        success: false,
        error: "LinkedIn account not connected. Please connect first."
      });
    }

    if (account.tokenExpiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        error: "Token expired. Please reconnect your LinkedIn account."
      });
    }

    console.log(`📱 Posting as: ${account.meta?.name} (${account.providerId})`);

    // Prepare LinkedIn post payload
    const postPayload = {
      author: `urn:li:person:${account.providerId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: content || ""
          },
          shareMediaCategory: file ? "IMAGE" : "NONE"
        }
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility
      }
    };

    let cloudinaryUrl = null;
    let cloudinaryPublicId = null;
    let mediaAsset = null;

    // ✅ Handle media upload to Cloudinary
    if (file) {
  try {
    console.log(`📸 Processing image: ${file.originalname}`);
    
    // ✅ 1. Upload to Cloudinary (for your records)
    console.log("📤 Uploading to Cloudinary...");
    
    const cloudinaryResult = await cloudinary.uploader.upload(file.path, {
      folder: 'linkedin-posts',
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 627, crop: 'fill' }
      ],
      format: 'jpg',
      quality: 'auto:good'
    });
    
    cloudinaryUrl = cloudinaryResult.secure_url;
    cloudinaryPublicId = cloudinaryResult.public_id;
    
    console.log(`✅ Cloudinary URL: ${cloudinaryUrl}`);
    
    // ✅ 2. Register upload with LinkedIn
    console.log("📤 Registering with LinkedIn...");
    
    const registerResponse = await axios.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: `urn:li:person:${account.providerId}`,
          serviceRelationships: [{
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent"
          }]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202402'
        }
      }
    );

    const uploadUrl = registerResponse.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
    mediaAsset = registerResponse.data.value.asset;

    console.log(`🎯 Media Asset: ${mediaAsset}`);
    
    // ✅ 3. Upload file directly to LinkedIn
    console.log("📤 Uploading file to LinkedIn...");
    
    const fileBuffer = fs.readFileSync(file.path);
    
    const uploadResponse = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': file.mimetype,
        'Content-Length': fileBuffer.length,
        'Content-Range': `bytes 0-${fileBuffer.length - 1}/${fileBuffer.length}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000
    });

    console.log(`✅ LinkedIn upload response: ${uploadResponse.status}`);
    
    // ✅ 4. Add media to post with proper structure
    postPayload.specificContent["com.linkedin.ugc.ShareContent"].media = [
      {
        status: "READY",
        description: {
          text: content ? content.substring(0, 200) : "Image post"
        },
        media: mediaAsset,
        title: {
          text: "Image"
        }
      }
    ];

    // ✅ 5. Update media category
    postPayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory = "IMAGE";
    
    // Clean up
    fs.unlinkSync(file.path);
    console.log("🗑️ Local file cleaned up");

  } catch (mediaError) {
    console.error("❌ Media error:", mediaError.message);
    console.error("❌ Error details:", mediaError.response?.data);
    
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    
    return res.status(500).json({
      success: false,
      error: `Media upload failed: ${mediaError.message}`
    });
  }
}
    // Save post to database
    const postData = {
      user: userId,
      platform: "linkedin",
      content: content || "",
      mediaType: file ? (file.mimetype.startsWith('video') ? 'video' : 'image') : null,
      mediaUrl: cloudinaryUrl,
      cloudinaryPublicId: cloudinaryPublicId,
      status: scheduleTime ? "scheduled" : "pending",
      scheduledTime: scheduleTime || null,
      accountInfo: {
        username: account.meta?.username,
        name: account.meta?.name,
        firstName: account.meta?.firstName,
        lastName: account.meta?.lastName,
        platformId: account.providerId
      }
    };

    const newPost = new Post(postData);
    await newPost.save();
    
    console.log(`💾 Post saved to DB with ID: ${newPost._id}`);

    // Function to post to LinkedIn API
    const postToLinkedInAPI = async (accessToken) => {
      try {
        console.log("🚀 Posting to LinkedIn API...");
        
        const response = await axios.post(
          'https://api.linkedin.com/v2/ugcPosts',
          postPayload,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0'
            },
            timeout: 60000
          }
        );

        const postId = response.data.id;
        const postUrl = `https://www.linkedin.com/feed/update/${postId}`;
        
        console.log(`✅ LinkedIn post created! ID: ${postId}, URL: ${postUrl}`);

        // Update post in database
        await Post.findByIdAndUpdate(newPost._id, {
          providerId: postId,
          postUrl: postUrl,
          status: "posted",
          postedAt: new Date(),
          linkedinAssetId: mediaAsset
        });

        console.log("✅ DB updated with post info");
        
        return { postId, postUrl };

      } catch (apiError) {
        console.error("❌ LinkedIn API Error:", apiError.message);
        console.error("❌ Error details:", apiError.response?.data);
        
        // Update post status to failed
        await Post.findByIdAndUpdate(newPost._id, {
          status: "failed",
          error: apiError.message || "Failed to post to LinkedIn"
        });
        
        throw apiError;
      }
    };

    // Handle scheduling
    if (scheduleTime) {
      console.log(`⏰ Scheduling post for: ${scheduleTime}`);
      const scheduleDate = new Date(scheduleTime);
      
      if (scheduleDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: "Schedule time must be in the future"
        });
      }
      
      // Schedule the post
      const job = schedule.scheduleJob(scheduleDate, async () => {
        try {
          console.log(`⏰ Scheduled job triggered for post: ${newPost._id}`);
          
          // Get fresh account for scheduled job
          const freshAccount = await TwitterAccount.findById(account._id);
          if (!freshAccount) {
            console.error("❌ Account not found for scheduled post");
            await Post.findByIdAndUpdate(newPost._id, {
              status: "failed",
              error: "LinkedIn account not found"
            });
            return;
          }
          
          // Post to LinkedIn
          await postToLinkedInAPI(freshAccount.accessToken);
          
        } catch (error) {
          console.error("❌ Scheduled post failed:", error);
          await Post.findByIdAndUpdate(newPost._id, {
            status: "failed",
            error: error.message || "Failed to post scheduled content"
          });
        }
      });
      
      // Store job ID in database
      await Post.findByIdAndUpdate(newPost._id, {
        scheduleJobId: job.name
      });
      
      return res.json({
        success: true,
        message: "Post scheduled successfully",
        postId: newPost._id,
        scheduledTime: scheduleTime,
        type: "scheduled",
        cloudinaryUrl: cloudinaryUrl,
        mediaType: file ? (file.mimetype.startsWith('video') ? 'video' : 'image') : null
      });
    }
    
    // Immediate posting
    const result = await postToLinkedInAPI(account.accessToken);
    
    res.json({
      success: true,
      postId: result.postId,
      postUrl: result.postUrl,
      message: "Post published successfully!",
      name: account.meta?.name,
      type: "posted",
      cloudinaryUrl: cloudinaryUrl,
      mediaType: file ? (file.mimetype.startsWith('video') ? 'video' : 'image') : null
    });
    
  } catch (err) {
    console.error("❌ Post Error:", err.message);
    console.error("❌ Error stack:", err.stack);
    
    // Clean up file if error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log(`🗑️ Cleaned up local file on final error: ${req.file.path}`);
    }
    
    res.status(500).json({
      success: false,
      error: err.message || "Failed to post to LinkedIn. Please try again.",
      details: err.response?.data?.message
    });
  }
};
// =========================
// 5️⃣ AI CAPTION GENERATION FOR LINKEDIN (SAME AS BEFORE - KEEP)
// =========================
export const generateLinkedInCaption = async (req, res) => {
  try {
    console.log("🤖 AI GENERATE CAPTION FOR LINKEDIN");
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
      const fallbackCaption = `${prompt} - Sharing professional insights! #${prompt.replace(/\s+/g, '').substring(0, 10)}`;
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
            content: `Create a professional LinkedIn post (max 3000 characters) about: "${prompt}". Make it suitable for professional networking. Include relevant hashtags.`
          }
        ],
        max_tokens: 200
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
    const fallbackCaption = `${req.body.prompt || "Topic"} - Sharing professional insights and perspectives! #ProfessionalDevelopment`;
    res.json({ 
      success: true,
      text: fallbackCaption,
      note: "AI service temporary unavailable, using fallback"
    });
  }
};

// =========================
// 6️⃣ DELETE SCHEDULED LINKEDIN POST (UPDATED - SAME AS TWITTER)
// =========================
export const deleteScheduledLinkedInPost = async (req, res) => {
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
      platform: "linkedin"
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
        error: "Only scheduled posts can be deleted"
      });
    }
    
    // If there's a Cloudinary media, optionally delete it (SAME AS TWITTER)
    if (post.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(post.cloudinaryPublicId);
        console.log(`🗑️ Deleted Cloudinary media: ${post.cloudinaryPublicId}`);
      } catch (cloudinaryError) {
        console.error("❌ Error deleting Cloudinary media:", cloudinaryError.message);
      }
    }
    
    // Delete from database
    await Post.findByIdAndDelete(postId);
    
    res.json({
      success: true,
      message: "Scheduled post deleted successfully"
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
// 7️⃣ Android Direct Auth (SAME AS BEFORE - KEEP)
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
// 8️⃣ Test Android Deep Link (SAME AS BEFORE - KEEP)
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
// 9️⃣ Get Platform Info (SAME AS BEFORE - KEEP)
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
// 🔟 Disconnect LinkedIn (SAME AS BEFORE - KEEP)
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
// 11️⃣ Test LinkedIn Connection (SAME AS BEFORE - KEEP)
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
// 12️⃣ Get User's LinkedIn Posts (SAME AS BEFORE - KEEP)
// =========================
export const getLinkedInPosts = async (req, res) => {
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
      platform: "linkedin"
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
// 13️⃣ Get LinkedIn Profile (SAME AS BEFORE - KEEP)
// =========================
export const getLinkedInProfile = async (req, res) => {
  try {
    const { userId } = req.query;
 
    console.log("🔍 LinkedIn Profile request received, userId:", userId);
 
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
      platform: "linkedin"
    });
 
    if (!account) {
      console.log("❌ Account not found for userId:", userId);
      return res.status(200).json({
        success: true,
        connected: false,
        message: "LinkedIn account not connected",
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
    let freshProfileData = null;
    let tokenStatus = "unknown";
 
    try {
      const response = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'cache-control': 'no-cache'
          }
        }
      );
      freshProfileData = response.data;
      tokenStatus = "valid";
      console.log("✅ Fresh LinkedIn data fetched for:", freshProfileData.name);
 
    } catch (apiError) {
      console.error("❌ Error fetching from LinkedIn API:", apiError.message);
      tokenStatus = "invalid_or_expired";
    }
 
    return res.json({
      success: true,
      connected: true,
      message: "LinkedIn account is connected",
      tokenDetails: {
        status: tokenStatus,
        hasAccessToken: !!account.accessToken,
        tokenExpiresAt: account.tokenExpiresAt,
        lastRefresh: account.lastTokenRefresh
      },
      profile: {
        userId: account.user,
        linkedinId: freshProfileData?.sub || account.meta?.linkedinId || account.providerId,
        name: freshProfileData?.name || account.meta?.name,
        firstName: freshProfileData?.given_name || account.meta?.firstName,
        lastName: freshProfileData?.family_name || account.meta?.lastName,
        email: freshProfileData?.email || account.meta?.email,
        profileImage: freshProfileData?.picture || account.meta?.profileImage || "https://cdn-icons-png.flaticon.com/512/174/174857.png",
        headline: freshProfileData?.headline || account.meta?.headline,
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
// 14️⃣ Verify Android Session for LinkedIn (SAME AS BEFORE - KEEP)
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
      // Clear expired session
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