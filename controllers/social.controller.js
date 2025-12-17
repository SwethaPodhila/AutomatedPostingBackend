import dotenv from "dotenv";
dotenv.config();

import SocialAccount from "../models/socialAccount.js";
//import fbApi from "../utils/FbApis.js";
import * as fbApi from "../utils/FbApis.js";
import axios from "axios";
import fs from "fs";
import multer from "multer";
import { publishToPage } from "../utils/FbApis.js";
import PostedPost from "../models/manualPosts.js";
import schedule from "node-schedule";

const { FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI, FRONTEND_URL } = process.env;

export const authRedirect = (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  const scopes = [
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_show_list",
    "public_profile",
    "email"
  ];

  const redirectUri =
    platform === "android"
      ? ANDROID_REDIRECT_URI   // ex: com.myapp://facebook/callback
      : FB_REDIRECT_URI;      // web redirect

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(userId)}` +
    `&scope=${scopes.join(",")}`;

  return res.redirect(url);
};

export const callback = async (req, res) => {
  try {
    console.log("===== FACEBOOK CALLBACK HIT =====");
    console.log("FULL QUERY:", req.query);

    const { code, state } = req.query;

    if (!code) return res.status(400).send("Missing code");
    if (!state) return res.status(400).send("Missing userId");

    const userId = state; // ✅ DO NOT decode

    const redirectUri =
      platform === "android"
        ? ANDROID_REDIRECT_URI
        : FB_REDIRECT_URI;

    const tokenRes = await fbApi.exchangeCodeForToken({
      clientId: FB_APP_ID,
      clientSecret: FB_APP_SECRET,
      redirectUri,   // ✅ IMPORTANT
      code,
    });

    const accessToken = tokenRes.access_token;
    if (!accessToken) return res.status(500).send("Failed to get access token");

    const pages = await fbApi.getUserPages(accessToken);

    for (const page of pages.data || []) {
      const pictureUrl = await fbApi.getPagePicture(
        page.id,
        page.access_token || accessToken
      );

      await SocialAccount.findOneAndUpdate(
        {
          user: userId,
          platform: "facebook",
          providerId: page.id
        },
        {
          user: userId,
          platform: "facebook",
          providerId: page.id,
          accessToken: page.access_token || accessToken,
          scopes: page.tasks || [],
          connectedFrom,
          meta: {
            ...page,
            picture: pictureUrl
          }
        },
        { upsert: true, new: true }
      );
    }

    if (platform === "android") {
      return res.json({
        success: true,
        message: "Facebook connected successfully",
        redirectUrl: "aimediahub://login-success",
      });
    }

    return res.redirect(`${FRONTEND_URL}/success`);

  } catch (err) {
    console.error("Callback Error ==>", err.response?.data || err.message);
    return res.status(500).send("Facebook callback error");
  }
};

export const publish = async (req, res) => {
  try {
    const { pageId, message, userId, scheduleTime } = req.body;
    const media = req.file;

    if (!pageId)
      return res.status(400).json({ msg: "Missing pageId" });

    if (!message && !media)
      return res.status(400).json({ msg: "Message or media required" });

    const acc = await SocialAccount.findOne({
      providerId: pageId,
      platform: "facebook",
    });

    if (!acc)
      return res.status(404).json({ msg: "Page not connected" });

    const mediaUrl = media ? media.path : null;
    const mediaType = media
      ? media.mimetype.startsWith("video")
        ? "video"
        : "image"
      : null;

    console.log("MEDIA TYPE:", mediaType);
    console.log("MEDIA URL:", mediaUrl);

    const result = await publishToPage({
      pageAccessToken: acc.accessToken,
      pageId,
      message,
      mediaUrl,
      mediaType,
      scheduleTime,
    });

    await PostedPost.create({
      user: userId,
      platform: "facebook",
      pageId,
      message,
      mediaUrl,
      mediaType,
      status: scheduleTime ? "scheduled" : "posted",
    });

    return res.json({ success: true, result });
  } catch (err) {
    console.error("PUBLISH ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
};


export const getPostedPosts = async (req, res) => {
  try {
    const { userId } = req.params;

    const posts = await PostedPost.find({ user: userId })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      posts,
    });
  } catch (err) {
    console.error("GET POSTS ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
};


// 4) Metrics: simple followers count for a page
export const metrics = async (req, res) => {
  try {
    const { pageId } = req.params;

    const acc = await SocialAccount.findOne({
      providerId: pageId,
      platform: "facebook",
    });

    if (!acc) {
      return res.status(404).json({ msg: "Page not connected" });
    }

    const url = `https://graph.facebook.com/v20.0/${pageId}`;
    const params = {
      fields: "name,fan_count,followers_count,engagement",
      access_token: acc.accessToken,
    };

    const response = await axios.get(url, { params });

    return res.json({ success: true, metrics: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

export const getPages = async (req, res) => {
  try {
    const { userId } = req.params;

    const pages = await SocialAccount.find({
      user: userId,
      platform: "facebook"
    });

    return res.json({ success: true, pages });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch pages" });
  }
};

export const generateAICaption = async (req, res) => {
  try {
    console.log("🔥 AI GENERATE CAPTION HIT 🔥");
    console.log("KEY:", process.env.OPENROUTER_KEY);
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ msg: "Prompt is required" });

    const apiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Create a catchy Facebook caption based on this topic: ${prompt}`
          }
        ],
        max_tokens: 60
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.FRONTEND_URL, // or frontend URL
          "X-Title": "Automated Posting App"
        },
      }
    );

    const caption = apiRes.data.choices[0].message.content;
    res.json({ text: caption });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ text: "", error: "AI generation failed" });
  }
};

export const disconnectAccount = async (req, res) => {
  try {
    const { platform } = req.params; // facebook / instagram
    const { userId } = req.body;

    if (!userId || !platform) {
      return res.status(400).json({
        success: false,
        msg: "Missing userId or platform",
      });
    }

    // delete connected account(s)
    const result = await SocialAccount.deleteMany({
      user: userId,
      platform,
    });

    if (result.deletedCount === 0) {
      return res.json({
        success: false,
        msg: "No account found to disconnect",
      });
    }

    return res.json({
      success: true,
      msg: `${platform} disconnected successfully`,
    });
  } catch (err) {
    console.error("DISCONNECT ERROR:", err.message);
    return res.status(500).json({
      success: false,
      msg: "Failed to disconnect account",
    });
  }
};

//instagram metrics connection callback 
export const instagramAuthRedirect = (req, res) => {
  console.log("🔥 INSTAGRAM AUTH REDIRECT HIT 🔥");

  const { userId } = req.query;
  console.log("userId:", userId);

  const redirectUri =
    "https://automatedpostingbackend.onrender.com/social/instagram/callback";

  console.log("redirectUri:", redirectUri);

  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement"
  ];

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${process.env.FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(userId)}` +
    `&scope=${scopes.join(",")}`;

  console.log("FB AUTH URL:", url);

  return res.redirect(url);
};

export const instagramCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = decodeURIComponent(state);

    if (!code) return res.status(400).send("Missing code");

    // Exchange code → token
    const tokenRes = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          redirect_uri: "https://automatedpostingbackend.onrender.com/social/instagram/callback",
          code
        }
      }
    );

    const userAccessToken = tokenRes.data.access_token;

    // Get pages
    const pagesRes = await axios.get(
      "https://graph.facebook.com/v20.0/me/accounts",
      { params: { access_token: userAccessToken } }
    );

    for (const page of pagesRes.data.data) {
      // Get IG business account
      const igRes = await axios.get(
        `https://graph.facebook.com/v20.0/${page.id}`,
        {
          params: {
            fields: "instagram_business_account",
            access_token: page.access_token
          }
        }
      );

      const ig = igRes.data.instagram_business_account;
      if (!ig) continue;

      // Get IG profile
      const profile = await axios.get(
        `https://graph.facebook.com/v20.0/${ig.id}`,
        {
          params: {
            fields: "username,profile_picture_url",
            access_token: page.access_token
          }
        }
      );

      await SocialAccount.findOneAndUpdate(
        { user: userId, platform: "instagram" },
        {
          user: userId,
          platform: "instagram",
          providerId: ig.id,
          accessToken: page.access_token,
          meta: {
            username: profile.data.username,
            picture: profile.data.profile_picture_url
          }
        },
        { upsert: true, new: true }
      );
    }

    return res.redirect(`${process.env.FRONTEND_URL}/instagram-dashboard`);
  } catch (err) {
    console.error("IG CALLBACK ERROR:", err.response?.data || err.message);
    return res.status(500).send("Instagram callback failed");
  }
};

export const publishInstagram = async (req, res) => {
  try {
    console.log("🔥 INSTAGRAM PUBLISH HIT 🔥");

    const { userId, caption, scheduleTime } = req.body;
    const file = req.file; // multer-cloudinary file
    console.log("Received file from multer:", file);

    if (!file && !caption) {
      console.log("❌ No media or caption provided");
      return res.status(400).json({ msg: "Media or caption required" });
    }

    // 🔹 Find connected IG account
    const acc = await SocialAccount.findOne({
      user: userId,
      platform: "instagram",
    });

    if (!acc) {
      console.log("❌ Instagram not connected for user:", userId);
      return res.status(404).json({ msg: "Instagram not connected" });
    }

    // 🔹 Detect media type
    const isVideo = file?.mimetype?.startsWith("video");
    // Use fallback for video URL
    const mediaUrl = file?.secure_url || file?.path;
    console.log("Detected media type:", isVideo ? "video" : "image");
    console.log("Media URL to be used:", mediaUrl);

    if (!mediaUrl) {
      console.log("❌ Media URL not available from Cloudinary");
      return res.status(400).json({ msg: "Media URL not available from Cloudinary" });
    }

    // 🔹 Save post in DB first
    const post = await PostedPost.create({
      user: userId,
      platform: "instagram",
      pageId: acc.providerId,
      pageName: acc.meta?.username,
      message: caption,
      mediaType: file?.resource_type,
      mediaUrl,
      scheduledTime: scheduleTime || null,
      status: scheduleTime ? "scheduled" : "posted",
    });
    console.log("Post saved in DB with ID:", post._id);

    // 🔹 Function to publish to Instagram
    const postToInstagram = async () => {
      try {
        const mediaPayload = isVideo
          ? {
            media_type: "REELS", // videos must use REELS
            video_url: mediaUrl,
            caption,
            access_token: acc.accessToken,
          }
          : {
            media_type: "IMAGE",
            image_url: mediaUrl,
            caption,
            access_token: acc.accessToken,
          };

        console.log("Posting to IG with payload:", mediaPayload);

        const mediaRes = await axios.post(
          `https://graph.facebook.com/v19.0/${acc.providerId}/media`,
          mediaPayload
        );
        console.log("Media created on IG:", mediaRes.data);

        const publishRes = await axios.post(
          `https://graph.facebook.com/v19.0/${acc.providerId}/media_publish`,
          {
            creation_id: mediaRes.data.id,
            access_token: acc.accessToken,
          }
        );
        console.log("Post published on IG:", publishRes.data);

        post.postId = publishRes.data.id;
        post.status = "posted";
        await post.save();
        console.log("✅ Instagram post saved in DB with IG postId:", publishRes.data.id);
      } catch (err) {
        console.error("❌ IG Post Error:", err.response?.data || err.message);
        post.status = "failed";
        await post.save();
        throw err;
      }
    };

    // 🟢 Immediate publish
    if (!scheduleTime) {
      await postToInstagram();
      return res.json({ success: true, type: "posted" });
    }

    // 🟡 Scheduled publish
    schedule.scheduleJob(new Date(scheduleTime), async () => {
      try {
        console.log("⏰ Scheduled job triggered for post:", post._id);
        await postToInstagram();
      } catch (err) {
        console.error(
          "❌ Scheduled IG post failed:",
          err.response?.data || err.message
        );
      }
    });

    console.log("Post scheduled successfully:", post._id);
    return res.json({ success: true, type: "scheduled" });
  } catch (err) {
    console.error("🔥 IG PUBLISH ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

export const instagramMetrics = async (req, res) => {
  try {
    const { userId } = req.params;

    const account = await SocialAccount.findOne({
      user: userId,
      platform: "instagram"
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        msg: "Instagram account not connected"
      });
    }

    const igId = account.providerId;

    const metricsRes = await axios.get(
      `https://graph.facebook.com/v20.0/${igId}`,
      {
        params: {
          fields: "followers_count,media_count",
          access_token: account.accessToken
        }
      }
    );

    return res.json({
      account: {
        platform: "instagram",
        meta: account.meta,
        providerId: igId
      },
      metrics: {
        followers: metricsRes.data.followers_count,
        mediaCount: metricsRes.data.media_count
      }
    });
  } catch (err) {
    console.error("IG METRICS ERROR:", err.response?.data || err.message);
    res.status(500).json({ success: false });
  }
};
