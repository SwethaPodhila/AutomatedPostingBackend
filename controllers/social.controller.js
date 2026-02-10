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
import PageAnalytics from "../models/PageAnalytics.js";

const { FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI, FRONTEND_URL, ANDROID_REDIRECT_URI } = process.env;

// controllers/facebookAuth.js

export const authRedirect = (req, res) => {
  const { userId, source } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  const scopes = [
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_show_list",
    "instagram_basic",
    "pages_read_user_content",
    "instagram_content_publish",
    "business_management",
    "pages_manage_metadata",
    "public_profile",
    "email",
    "read_insights"
  ];

  const redirectUri = FB_REDIRECT_URI;
  const state = `${userId}:${source || "web"}`;

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${scopes.join(",")}` +
    `&auth_type=rerequest`;

  return res.redirect(url);
};

export const callback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send("Invalid callback");

    const [userId, source] = state.split(":");

    console.log("📌 Callback received for user:", userId, "source:", source);

    // 1️⃣ Exchange code → short token
    const tokenRes = await fbApi.exchangeCodeForToken({
      clientId: FB_APP_ID,
      clientSecret: FB_APP_SECRET,
      redirectUri: FB_REDIRECT_URI,
      code,
    });
    const shortToken = tokenRes.access_token;
    console.log("📌 Short-Lived Token:", shortToken);
    if (!shortToken) throw new Error("User token missing");

    // 2️⃣ Long lived token
    const longToken = await fbApi.getLongLivedUserToken(
      shortToken,
      FB_APP_ID,
      FB_APP_SECRET
    );
    console.log("📌 Long-Lived Token:", longToken);

    // 3️⃣ Debug token to see granted permissions
    const debug = await fbApi.debugToken(longToken);
    console.log("📌 Token Debug Info:", debug.data);

    // 4️⃣ PROFILE-OWNED pages
    let profilePages = [];
    try {
      console.log("📌 Fetching profile pages...");
      profilePages = await fbApi.getUserPages(longToken);
      console.log("📘 Profile Pages:", profilePages);
    } catch (err) {
      console.error("❌ Error fetching profile pages:", err.response?.data || err.message);
    }

    // 5️⃣ BUSINESS-OWNED pages
    let businessPages = [];
    try {
      console.log("📌 Fetching user businesses...");
      const businesses = await fbApi.getUserBusinesses(longToken);
      console.log("📘 User Businesses:", businesses);

      for (const biz of businesses) {
        try {
          console.log("📌 Fetching business pages for:", biz.id);
          const pages = await fbApi.getBusinessPages(biz.id, longToken);
          console.log("📘 Business Pages for", biz.id, ":", pages);
          businessPages.push(...pages);
        } catch (err) {
          console.error(`❌ Error fetching business pages for ${biz.id}:`, err.response?.data || err.message);
        }
      }
    } catch (err) {
      console.error("❌ Error fetching businesses:", err.response?.data || err.message);
    }

    // 6️⃣ MERGE + REMOVE DUPLICATES
    const pageMap = new Map();
    [...profilePages, ...businessPages].forEach(p => {
      if (p?.id && p?.access_token) pageMap.set(p.id, p);
    });
    const allPages = [...pageMap.values()];
    console.log("📘 ALL CONNECTED PAGES:", allPages);

    // 7️⃣ SAVE PAGES
    // 7️⃣ SAVE PAGES + INIT ANALYTICS
    for (const page of allPages) {
      try {
        const pictureUrl = await fbApi.getPagePicture(page.id, page.access_token);
        const igAccount = await fbApi.getInstagramBusinessAccount(page.id, page.access_token);

        // ✅ Save / Update SocialAccount
        const socialAccount = await SocialAccount.findOneAndUpdate(
          { user: userId, platform: "facebook", providerId: page.id },
          {
            user: userId,
            platform: "facebook",
            providerId: page.id,
            accessToken: page.access_token,
            connectedFrom: source || "web",
            meta: {
              id: page.id,
              name: page.name,
              category: page.category,
              tasks: page.tasks,
              picture: pictureUrl,
              instagramBusinessAccount: igAccount || null,
            },
          },
          { upsert: true, new: true }
        );

        // ✅ INIT PAGE ANALYTICS (🔥 THIS IS THE KEY)
        const today = new Date().toISOString().split("T")[0];

        await PageAnalytics.findOneAndUpdate(
          {
            socialAccount: socialAccount._id,
            providerId: page.id,
            date: today,
          },
          {
            $setOnInsert: {
              platform: "facebook",
              followers: 0,
              impressions: 0,
              reach: 0,
              engagement: 0,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        console.log(`✅ Saved page + analytics ${page.name} (${page.id})`);
      } catch (err) {
        console.error(`❌ Error saving page ${page.id}:`, err.response?.data || err.message);
      }
    }

    // 8️⃣ Redirect
    if (source === "android") {
      return res.redirect("com.wingspan.aimediahub://login-success");
    }

    return res.redirect(`${FRONTEND_URL}/success`);
  } catch (err) {
    console.error("❌ Facebook Callback Error:", err.response?.data || err.message);
    return res.status(500).send("Facebook callback error");
  }
};

export const publish = async (req, res) => {
  try {
    console.log("🔥 FACEBOOK PUBLISH HIT 🔥");
    const { pageId, message, userId, scheduleTime } = req.body;
    const media = req.file;

    if (!pageId)
      return res.status(400).json({ msg: "Missing pageId" });

    if (!message && !media)
      return res.status(400).json({ msg: "Message or media required" });

    console.log("REQ pageId:", pageId);
    console.log("DB facebook accounts:", await SocialAccount.find({ platform: "facebook" }));

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

export const getInstagramAccounts = async (req, res) => {
  try {
    const { userId } = req.params;

    const accounts = await SocialAccount.find({
      user: userId,
      platform: "instagram"
    });

    return res.json({
      success: true,
      accounts
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Instagram accounts"
    });
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

    // 1️⃣ Find all connected accounts first
    const accounts = await SocialAccount.find({ user: userId, platform });

    if (!accounts.length) {
      return res.json({
        success: false,
        msg: "No account found to disconnect",
      });
    }

    // 2️⃣ Delete related PageAnalytics
    const socialIds = accounts.map(a => a._id);
    await PageAnalytics.deleteMany({ socialAccount: { $in: socialIds } });

    // 3️⃣ Delete SocialAccount(s)
    const result = await SocialAccount.deleteMany({
      user: userId,
      platform,
    });

    return res.json({
      success: true,
      msg: `${platform} disconnected successfully, related analytics removed`,
    });
  } catch (err) {
    console.error("DISCONNECT ERROR:", err.message);
    return res.status(500).json({
      success: false,
      msg: "Failed to disconnect account",
    });
  }
};


// 🔁 INSTAGRAM AUTH REDIRECT (WEB + ANDROID)
export const instagramAuthRedirect = (req, res) => {
  const { userId, source } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  const redirectUri =
    "https://automatedpostingbackend-h9dc.onrender.com/social/instagram/callback";

  const scopes = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
  ];

  // 👇 SAME PATTERN AS FACEBOOK
  const state = `${userId}:${source || "web"}`;

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${process.env.FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${scopes.join(",")}` +
    `&auth_type=rerequest`;

  console.log("📸 INSTAGRAM AUTH URL:", url);

  return res.redirect(url);
};

export const instagramCallback = async (req, res) => {
  try {
    console.log("🔔 Instagram callback hit");

    const { code, state } = req.query;
    console.log("➡️ Query params:", { codePresent: !!code, state });

    if (!code || !state) {
      console.log("❌ Missing code or state");
      return res.status(400).send("Invalid callback");
    }

    const [userId, source] = state.split(":");

    // 1️⃣ Exchange code → user access token
    console.log("🔄 Exchanging code for access token...");

    const tokenRes = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          client_id: process.env.FB_APP_ID,
          client_secret: process.env.FB_APP_SECRET,
          redirect_uri:
            "https://automatedpostingbackend-h9dc.onrender.com/social/instagram/callback",
          code,
        },
      }
    );

    const userAccessToken = tokenRes.data.access_token;
    console.log("🔑 User access token received:", !!userAccessToken);

    if (!userAccessToken) throw new Error("Access token missing");

    // 2️⃣ Get pages
    console.log("📄 Fetching Facebook pages...");

    const pagesRes = await axios.get(
      "https://graph.facebook.com/v20.0/me/accounts",
      { params: { access_token: userAccessToken } }
    );

    const pages = pagesRes.data.data || [];
    console.log(`📄 Total pages found: ${pages.length}`);

    for (const page of pages) {
      console.log("➡️ Page:", {
        id: page.id,
        name: page.name,
        hasPageToken: !!page.access_token,
      });

      // 3️⃣ Get IG business account
      console.log(`🔍 Checking IG link for page: ${page.name}`);

      const igRes = await axios.get(
        `https://graph.facebook.com/v20.0/${page.id}`,
        {
          params: {
            fields: "instagram_business_account",
            access_token: page.access_token,
          },
        }
      );

      console.log("📸 IG raw response:", igRes.data);

      const ig = igRes.data.instagram_business_account;

      if (!ig) {
        console.log(`⚠️ No IG business account linked for page: ${page.name}`);
        continue;
      }

      const profileRes = await axios.get(
        `https://graph.facebook.com/v20.0/${ig.id}`,
        {
          params: {
            fields: "username,profile_picture_url",
            access_token: page.access_token,
          },
        }
      );

      console.log("💾 Saving Instagram account to DB...");

      await SocialAccount.findOneAndUpdate(
        { user: userId, platform: "instagram", providerId: ig.id },
        {
          user: userId,
          platform: "instagram",
          providerId: ig.id,
          accessToken: page.access_token,
          connectedFrom: source || "web",
          meta: {
            username: profileRes.data.username,
            picture: profileRes.data.profile_picture_url,
            pageId: page.id,
            pageName: page.name,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Instagram account saved: ${profileRes.data.username}`);
    }

    console.log("🎯 Instagram callback completed");

    // 6️⃣ Final redirect
    if (source === "android") {
      console.log("📲 Redirecting to Android deep link");
      return res.redirect("com.wingspan.aimediahub://instagram-success");
    }

    console.log("🌐 Redirecting to web dashboard");
    return res.redirect(`${process.env.FRONTEND_URL}/instagram-dashboard`);

  } catch (err) {
    console.error(
      "❌ IG CALLBACK ERROR:",
      err.response?.data || err.message
    );
    return res.status(500).send("Instagram callback failed");
  }
};

const waitForVideoProcessing = async (creationId, accessToken) => {
  let status = "IN_PROGRESS";

  while (status === "IN_PROGRESS") {
    await new Promise((r) => setTimeout(r, 5000)); // wait 5 sec

    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${creationId}`,
      {
        params: {
          fields: "status_code",
          access_token: accessToken,
        },
      }
    );

    status = res.data.status_code;
    console.log("🎥 Video processing status:", status);

    if (status === "ERROR") throw new Error("Video processing failed on Instagram");
  }
};

export const publishInstagram = async (req, res) => {
  try {
    console.log("🔥 INSTAGRAM PUBLISH HIT 🔥");

    const { userId, caption, scheduleTime } = req.body;
    const file = req.file;

    if (!file && !caption)
      return res.status(400).json({ msg: "Media or caption required" });

    // Get connected Instagram account
    const acc = await SocialAccount.findOne({ user: userId, platform: "instagram" });
    if (!acc) return res.status(404).json({ msg: "Instagram not connected" });

    const isVideo = file?.mimetype?.startsWith("video");
    const mediaUrl = file?.secure_url || file?.path;

    if (!mediaUrl) return res.status(400).json({ msg: "Media URL not available" });

    // Save post in DB first
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

    // Publish function
    const postToInstagram = async () => {
      try {
        const mediaPayload = isVideo
          ? { media_type: "REELS", video_url: mediaUrl, caption, access_token: acc.accessToken }
          : { image_url: mediaUrl, caption, access_token: acc.accessToken };

        // 1️⃣ Create media
        const mediaRes = await axios.post(
          `https://graph.facebook.com/v19.0/${acc.providerId}/media`,
          mediaPayload
        );
        console.log("Media created on IG:", mediaRes.data);

        // 2️⃣ Wait if video
        if (isVideo) await waitForMediaReady(mediaRes.data.id, acc.accessToken);

        // 3️⃣ Publish media
        const publishRes = await axios.post(
          `https://graph.facebook.com/v19.0/${acc.providerId}/media_publish`,
          { creation_id: mediaRes.data.id, access_token: acc.accessToken }
        );

        console.log("Post published on IG:", publishRes.data);

        // 4️⃣ Update DB
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

    // Immediate publish
    if (!scheduleTime) {
      await postToInstagram();
      return res.json({ success: true, type: "posted" });
    }

    // Scheduled publish
    schedule.scheduleJob(new Date(scheduleTime), async () => {
      try {
        console.log("⏰ Scheduled job triggered for post:", post._id);
        await postToInstagram();
      } catch (err) {
        console.error("❌ Scheduled IG post failed:", err.response?.data || err.message);
      }
    });

    console.log("Post scheduled successfully:", post._id);
    return res.json({ success: true, type: "scheduled" });
  } catch (err) {
    console.error("🔥 IG PUBLISH ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

const waitForMediaReady = async (creationId, accessToken) => {
  let status = "IN_PROGRESS";
  let attempts = 0;

  while (status === "IN_PROGRESS") {
    attempts++;
    console.log(`⏳ IG processing attempt #${attempts}`);

    await new Promise(r => setTimeout(r, 5000));

    const res = await axios.get(
      `https://graph.facebook.com/v19.0/${creationId}`,
      {
        params: {
          fields: "status_code",
          access_token: accessToken
        }
      }
    );

    status = res.data.status_code;
    console.log("📸 IG MEDIA STATUS:", status);

    if (status === "ERROR") {
      console.error("❌ IG returned ERROR status");
      throw new Error("Instagram media processing failed");
    }

    if (attempts > 12) {
      throw new Error("⏰ Timeout waiting for IG media processing");
    }
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
