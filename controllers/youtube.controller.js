import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import axios from "axios";
import cloudinary from "../config/cloudinary.js";
import User from "../models/users.js";
import jwt from "jsonwebtoken";
import TwitterAccount from "../models/TwitterAccount.js";
import Post from "../models/Post.js";
dotenv.config();

// =========================
// GOOGLE OAUTH CLIENT
// =========================
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI="https://automatedpostingbackend-h9dc.onrender.com/api/youtube/callback"
);

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube"
];

// =========================
// 1️⃣ CONNECT YOUTUBE
// =========================
export const connectYouTube = (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      console.error("❌ No userId in YouTube connect request");
      return res.status(400).json({
        success: false,
        error: "userId parameter required"
      });
    }

    console.log("🔗 YouTube connect for userId:", userId);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state: userId,
      include_granted_scopes: true
    });

    console.log("✅ Generated YouTube auth URL");
    res.redirect(authUrl);

  } catch (err) {
    console.error("❌ YouTube Connect Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to initiate YouTube connection"
    });
  }
};

// =========================

// 2️⃣ YOUTUBE CALLBACK
// =========================
export const youtubeCallback = async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    
    console.log("🔗 YouTube callback received");
    console.log("📌 Code:", code ? "Received" : "Missing");
    console.log("📌 UserId:", userId);

    if (!code || !userId) {
      console.error("❌ Missing code or userId in callback");
      return res.redirect(`${process.env.FRONTEND_URL || "https://automatedpostingsfrontend-7d5o.onrender.com"}/youtube-connect?error=missing_params`);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log("✅ Tokens received from Google:", {
      access_token: tokens.access_token ? "YES" : "NO",
      refresh_token: tokens.refresh_token ? "YES" : "NO",
      expiry_date: tokens.expiry_date
    });
    
    // Set credentials
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    
    let channelName = "YouTube Channel";
    let channelId = null;
    let subscribers = 0;
    let username = null;
    let profileImage = null;

    try {
      // Get YouTube channel info
      const channelResponse = await youtube.channels.list({
        part: "snippet,statistics",
        mine: true
      });

      if (channelResponse.data?.items?.length > 0) {
        const channel = channelResponse.data.items[0];
        channelName = channel?.snippet?.title || "YouTube Channel";
        channelId = channel?.id || null;
        subscribers = channel?.statistics?.subscriberCount || 0;
        username = channel?.snippet?.customUrl || channelName.replace(/\s+/g, '');
        profileImage = channel?.snippet?.thumbnails?.high?.url || channel?.snippet?.thumbnails?.default?.url;
        
        console.log(`✅ YouTube channel found: ${channelName} (${subscribers} subscribers)`);
      } else {
        console.warn("⚠️ No channel data found");
        channelName = "YouTube Account";
      }
    } catch (channelError) {
      console.error("❌ Error getting channel info:", channelError.message);
    }

    try {
      // 🔄 Save to User model
      const existingUser = await User.findById(userId);

      const updateData = {
        youtubeAccessToken: tokens.access_token,
        youtubeRefreshToken: tokens.refresh_token || existingUser?.youtubeRefreshToken,
        youtubeTokenExpiry: tokens.expiry_date,
        youtubeConnected: true,
        youtubeConnectedAt: new Date(),
        youtubeChannelName: channelName,
        youtubeSubscribers: subscribers
      };

      if (channelId) updateData.youtubeChannelId = channelId;

      await User.findByIdAndUpdate(userId, updateData);
      console.log(`✅ YouTube account saved to User model for user: ${userId}`);
      
      // 🔄 Save to TwitterAccount model
      try {
        const accountData = {
          user: userId,
          platform: "youtube",
          providerId: channelId || `yt-${Date.now()}`,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || existingUser?.youtubeRefreshToken,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          scopes: SCOPES,
          
          // Account info
          username: username,
          displayName: channelName,
          profileImage: profileImage,
          profileUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : null,
          
          // Platform-specific IDs
          youtubeChannelId: channelId,
          
          // Store in meta field
          meta: {
            youtubeChannelId: channelId,
            youtubeChannelTitle: channelName,
            youtubeProfileImage: profileImage,
            subscribers: subscribers,
            connectedAt: new Date()
          }
        };

        // Upsert: Update if exists, create if not
        await TwitterAccount.findOneAndUpdate(
          { 
            user: userId, 
            platform: "youtube"
          },
          accountData,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        
        console.log(`✅ YouTube account saved to TwitterAccount model`);
        
      } catch (accountError) {
        console.error("❌ Error saving to TwitterAccount model:", accountError.message);
        // Don't fail the whole process
      }

      // Redirect to YouTube Manager
      const successRedirectUrl = `${process.env.FRONTEND_URL || "https://automatedpostingsfrontend-7d5o.onrender.com"}/youtube-manager?youtube=connected&channel=${encodeURIComponent(channelName)}&channelId=${channelId}`;
      console.log(`🌐 Redirecting to: ${successRedirectUrl}`);
      
      res.redirect(successRedirectUrl);

    } catch (dbError) {
      console.error("❌ Database save error:", dbError.message);
      res.redirect(`${process.env.FRONTEND_URL || "https://automatedpostingsfrontend-7d5o.onrender.com"}/youtube-connect?error=auth_failed`);
    }
  } catch (err) {
    console.error("❌ YouTube Callback Error:", err.message);
    res.redirect(`${process.env.FRONTEND_URL || "https://automatedpostingsfrontend-7d5o.onrender.com"}/youtube-connect?error=auth_failed`);
  }
};


// =========================
// 3️⃣ CHECK YOUTUBE CONNECTION
// =========================
export const checkYouTubeConnection = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.json({ 
        success: true,
        connected: false,
        message: "No authentication token"
      });
    }

    const decoded = jwt.decode(token);
    if (!decoded?.id) {
      return res.json({ 
        success: true,
        connected: false,
        message: "Invalid token"
      });
    }

    const user = await User.findById(decoded.id);

    console.log("YT TOKEN CHECK:", {
      access: user?.youtubeAccessToken ? "YES" : "NO",
      refresh: user?.youtubeRefreshToken ? "YES" : "NO",
      channelId: user?.youtubeChannelId
    });

    // Also check TwitterAccount model
    const youtubeAccount = await TwitterAccount.findOne({
      user: decoded.id,
      platform: "youtube"
    });

    if (!user || !user.youtubeAccessToken) {
      return res.json({ 
        success: true,
        connected: false,
        message: "YouTube account not connected"
      });
    }

    res.json({
      success: true,
      connected: true,
      channelName: user.youtubeChannelName || "YouTube Channel",
      channelId: user.youtubeChannelId,
      subscribers: user.youtubeSubscribers || 0,
      connectedAt: user.youtubeConnectedAt,
      accountInTwitterModel: !!youtubeAccount
    });

  } catch (err) {
    console.error("❌ Check YouTube Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
// =========================
// 4️⃣ DISCONNECT YOUTUBE
// =========================
export const disconnectYouTube = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "Not authenticated" });

    const decoded = jwt.decode(token);
    const userId = decoded.id;

    // 🔄 Disconnect from User model
    await User.findByIdAndUpdate(userId, {
      youtubeAccessToken: null,
      youtubeRefreshToken: null,
      youtubeChannelId: null,
      youtubeChannelName: null,
      youtubeSubscribers: null,
      youtubeConnected: false,
      youtubeConnectedAt: null,
      youtubeTokenExpiry: null
    });

    // 🔄 Remove from TwitterAccount model
    await TwitterAccount.findOneAndDelete({
      user: userId,
      platform: "youtube"
    });

    console.log(`✅ YouTube disconnected for user: ${userId}`);

    res.json({
      success: true,
      message: "YouTube disconnected successfully"
    });

  } catch (err) {
    console.error("❌ Disconnect YouTube Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};


// =========================
// 5️⃣ GET YOUTUBE VIDEOS
// =========================
export const getYouTubeVideos = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "Not authenticated" });

    const decoded = jwt.decode(token);
    const user = await User.findById(decoded.id);

    if (!user?.youtubeAccessToken) {
      return res.status(400).json({
        success: false,
        error: "YouTube account not connected. Please connect first."
      });
    }

    // Set credentials
    oauth2Client.setCredentials({
  access_token: user.youtubeAccessToken,
  refresh_token: user.youtubeRefreshToken
});

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    try {
      // Get channel videos
      const response = await youtube.search.list({
        part: "snippet",
        forMine: true,
        type: "video",
        maxResults: 20,
        order: "date"
      });

      const videos = response.data.items ? response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle
      })) : [];

      res.json({
        success: true,
        videos: videos,
        total: videos.length
      });

    } catch (youtubeError) {
      console.error("❌ YouTube API Error:", youtubeError.message);
      
      res.json({
        success: true,
        videos: [],
        total: 0,
        message: "Could not fetch videos at this time"
      });
    }

  } catch (err) {
    console.error("❌ Get YouTube Videos Error:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

// =========================
// 6️⃣ UPLOAD VIDEO TO YOUTUBE VIA CLOUDINARY
// =========================
export const uploadYouTubeVideo = async (req, res) => {
  console.log("🚀 YouTube Video Upload via Cloudinary Started");
  
  let localFilePath = null;
  let cloudinaryPublicId = null;
  let videoId = null;

  try {
    // 1. Authentication check
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: "Not authenticated" 
      });
    }

    const decoded = jwt.decode(token);
    const userId = decoded.id;
    const user = await User.findById(userId);

    console.log("YT TOKEN CHECK:", {
      access: user?.youtubeAccessToken ? "YES" : "NO",
      refresh: user?.youtubeRefreshToken ? "YES" : "NO",
      channelId: user?.youtubeChannelId
    });

    if (!user?.youtubeRefreshToken) {
      return res.status(400).json({
        success: false,
        error: "YouTube account not connected. Please connect first."
      });
    }

    // 2. File validation
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No video file uploaded"
      });
    }

    localFilePath = req.file.path;
    
    if (!fs.existsSync(localFilePath)) {
      return res.status(400).json({
        success: false,
        error: "Uploaded file not found"
      });
    }

    console.log(`📁 Video File: ${req.file.originalname}, Size: ${(req.file.size / (1024*1024)).toFixed(2)} MB`);
    console.log("📝 Upload Data:", JSON.stringify(req.body, null, 2));

    // 3. Get form data
    const { title, description = "", privacyStatus = "private", tags = "", scheduleTime } = req.body;

    if (!title || title.trim() === "") {
      throw new Error("Video title is required");
    }

    // 4. Upload to Cloudinary
    console.log("☁️ Step 1: Uploading to Cloudinary...");
    
    let cloudinaryResult;
    try {
      cloudinaryResult = await cloudinary.uploader.upload(localFilePath, {
        resource_type: "video",
        folder: "youtube-videos",
        chunk_size: 6000000,
        timeout: 300000
      });
      
      cloudinaryPublicId = cloudinaryResult.public_id;
      console.log(`✅ Cloudinary upload successful!`);
      console.log(`🔗 Cloudinary URL: ${cloudinaryResult.secure_url}`);
      console.log(`📊 Video Duration: ${cloudinaryResult.duration || "Unknown"} seconds`);
      
    } catch (cloudinaryError) {
      console.error("❌ Cloudinary upload failed:", cloudinaryError.message);
      throw new Error(`Cloudinary upload failed: ${cloudinaryError.message}`);
    }

    // 5. Set up YouTube authentication
    console.log("🔐 Step 2: Setting up YouTube authentication...");
    
    oauth2Client.setCredentials({
      refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client
    });

    // 6. Prepare video data for YouTube
    console.log("📦 Step 3: Preparing YouTube video data...");
    
    const youtubeRequestBody = {
      snippet: {
        title: title,
        description: description,
        tags: tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        categoryId: "22"
      },
      status: {
        privacyStatus: privacyStatus,
        selfDeclaredMadeForKids: false
      }
    };

let scheduledTime = null;
let postStatus = "posted";
let postedAt = new Date();

if (scheduleTime && scheduleTime.trim() !== "") {
  try {
    const scheduleDate = new Date(scheduleTime);
    const now = new Date();

    if (isNaN(scheduleDate.getTime())) {
      throw new Error("Invalid schedule date");
    }

    const minTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    const maxTime = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

    if (scheduleDate < minTime) {
      throw new Error("Schedule time must be at least 10 minutes in the future");
    }

    if (scheduleDate > maxTime) {
      throw new Error("Schedule time must be within 60 days");
    }

    // ✅ ONLY THIS FORMAT IS ACCEPTED BY YOUTUBE
    youtubeRequestBody.status = {
      privacyStatus: "private",
      publishAt: scheduleDate.toISOString(),
    };

    scheduledTime = scheduleDate;
    postStatus = "scheduled";
    postedAt = null;

    console.log("✅ YouTube scheduled at:", scheduleDate.toISOString());

  } catch (err) {
    console.error("❌ Schedule error:", err.message);
    throw err;
  }
}

    // 7. Download video from Cloudinary for YouTube upload
    console.log("📥 Step 4: Downloading video from Cloudinary...");
    
    let videoStream;
    try {
      const videoResponse = await axios({
        method: 'get',
        url: cloudinaryResult.secure_url,
        responseType: 'stream',
        timeout: 300000
      });
      
      videoStream = videoResponse.data;
    } catch (downloadError) {
      console.error("❌ Failed to download from Cloudinary:", downloadError.message);
      throw new Error(`Failed to download video: ${downloadError.message}`);
    }

    // 8. Upload to YouTube
    console.log("📤 Step 5: Uploading to YouTube...");
    
    let youtubeResponse;
    try {
      youtubeResponse = await youtube.videos.insert({
        part: "snippet,status",
        requestBody: youtubeRequestBody,
        media: {
          body: videoStream
        }
      });
      
    } catch (youtubeError) {
      console.error("❌ YouTube upload failed:", youtubeError.message);
      
      if (youtubeError.response?.data?.error) {
        console.error("📋 YouTube Error Details:", JSON.stringify(youtubeError.response.data.error, null, 2));
        
        // Handle specific YouTube errors
        if (youtubeError.response.data.error.errors && 
            youtubeError.response.data.error.errors[0].reason === 'invalidPublishAt') {
          throw new Error("Invalid schedule time. Please schedule at least 10 minutes in the future and within 60 days.");
        }
      }
      
      throw new Error(`YouTube upload failed: ${youtubeError.message}`);
    }

    // 9. Get YouTube video details
    videoId = youtubeResponse.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`🎉 SUCCESS! Video uploaded to YouTube!`);
    console.log(`📹 Video ID: ${videoId}`);
    console.log(`🔗 YouTube URL: ${youtubeUrl}`);

    // 🔄 10. Save post to database
    try {
      console.log("💾 Step 6: Saving post to database...");
      
      // Get YouTube account info
      const youtubeAccount = await TwitterAccount.findOne({
        user: userId,
        platform: "youtube"
      });

      // Create post record
      const postData = {
        user: userId,
        platform: "youtube",
        content: description,
        mediaType: "youtube",
        mediaUrl: cloudinaryResult.secure_url,
        cloudinaryPublicId: cloudinaryPublicId,
        status: postStatus,
        scheduledTime: scheduledTime,
        postedAt: postedAt,
        postUrl: youtubeUrl,
        youtubeVideoId: videoId,
        youtubeChannelId: user.youtubeChannelId,
        
        // Account info
        accountInfo: {
          username: youtubeAccount?.username || user.youtubeChannelName || "YouTube User",
          name: user.youtubeChannelName || "YouTube Channel",
          profileImage: youtubeAccount?.profileImage,
          platformId: user.youtubeChannelId
        }
      };

      const newPost = new Post(postData);
      await newPost.save();
      
      console.log(`✅ Post saved to database with ID: ${newPost._id}`);
      console.log(`📊 Post Status: ${postStatus}`);
      
    } catch (postSaveError) {
      console.error("❌ Error saving post to database:", postSaveError.message);
      // Continue even if post save fails
    }

    // 11. Clean up Cloudinary file
    try {
      await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: "video" });
      console.log("🗑️ Cloudinary file cleaned up");
    } catch (cleanupError) {
      console.warn("⚠️ Could not delete Cloudinary file:", cleanupError.message);
    }

    // 12. Send success response
    const successMessage = scheduledTime 
      ? `✅ Video scheduled successfully for ${new Date(scheduledTime).toLocaleString()}!` 
      : `✅ Video uploaded to YouTube successfully!`;
    
    res.json({
      success: true,
      videoId: videoId,
      youtubeUrl: youtubeUrl,
      title: title,
      privacyStatus: privacyStatus,
      scheduled: !!scheduledTime,
      message: successMessage,
      postSaved: true,
      postId: videoId
    });

  } catch (err) {
    console.error("❌ UPLOAD FAILED:", err.message);
    
    // Clean up resources
    try {
      if (localFilePath && fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        console.log("🗑️ Local file cleaned up");
      }
      
      if (cloudinaryPublicId) {
        await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: "video" });
        console.log("🗑️ Cloudinary file cleaned up after error");
      }
    } catch (cleanupError) {
      console.error("❌ Error during cleanup:", cleanupError.message);
    }
    
    res.status(500).json({
      success: false,
      error: err.message || "Video upload failed",
      details: err.message
    });
    
  } finally {
    // Final cleanup
    if (localFilePath && fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
      } catch (e) {}
    }
  }
};
// =========================
// 7️⃣ UPLOAD IMAGES TO CLOUDINARY
// =========================
export const uploadImages = async (req, res) => {
  try {
    console.log("🖼️ Image Upload Request Received");
    
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: "Not authenticated" 
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No images uploaded"
      });
    }

    console.log(`📸 Uploading ${req.files.length} image(s)...`);

    const uploadedImages = [];
    
    // Upload each image to Cloudinary
    for (const file of req.files) {
      try {
        console.log(`📤 Uploading: ${file.originalname}`);
        
        const result = await cloudinary.uploader.upload(file.path, {
          folder: "images",
          transformation: [
            { quality: "auto:good" },
            { fetch_format: "auto" }
          ]
        });
        
        uploadedImages.push({
          originalName: file.originalname,
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          size: result.bytes,
          width: result.width,
          height: result.height
        });
        
        console.log(`✅ Uploaded: ${file.originalname} -> ${result.secure_url}`);
        
        // Delete local file
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        
      } catch (fileError) {
        console.error(`❌ Failed to upload ${file.originalname}:`, fileError.message);
        // Continue with other files
      }
    }

    if (uploadedImages.length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload any images"
      });
    }

    res.json({
      success: true,
      message: `Successfully uploaded ${uploadedImages.length} image(s)`,
      images: uploadedImages,
      count: uploadedImages.length
    });

  } catch (err) {
    console.error("❌ Image Upload Error:", err.message);
    
    // Clean up any remaining files
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // Ignore
          }
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: err.message || "Image upload failed"
    });
  }
};

// =========================
// 8️⃣ AI CONTENT GENERATOR
// =========================
export const generateYouTubeContent = async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt || prompt.trim() === "") {
      return res.status(400).json({ 
        success: false,
        error: "Prompt is required" 
      });
    }

    // Generate content
    const title = `🎬 ${prompt} - Complete Guide & Tutorial`;
    const description = `In this video, we'll explore everything about "${prompt}" in detail.

📌 What you'll learn:
• Understanding ${prompt}
• Step-by-step process
• Tips and best practices
• Common mistakes to avoid

👍 If you find this video helpful, please LIKE and SUBSCRIBE!
🔔 Turn on notifications so you never miss an update!

💬 Have questions? Leave them in the comments below!

#${prompt.replace(/\s+/g, '')} #Tutorial #Guide #Learn #Education`;

    const tags = `${prompt}, tutorial, how to, guide, learn, education, youtube, video`;

    res.json({
      success: true,
      title: title,
      description: description,
      tags: tags
    });

  } catch (err) {
    console.error("❌ AI Generation Error:", err);
    
    // Fallback
    res.json({
      success: true,
      title: `${req.body.prompt || "Topic"} - YouTube Video`,
      description: "Check out this amazing video! Don't forget to like and subscribe!",
      tags: "YouTube, Video, Content"
    });
  }
};