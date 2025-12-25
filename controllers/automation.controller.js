import Automation from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";
import PostedPost from "../models/manualPosts.js";
import post from "../models/Post.js";
import { publishToPage } from "../utils/FbApis.js";

import { publishInstagramUtil } from "../utils/instagramApi.js";

export const triggerAutomation = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const {
      userId,
      prompt,
      startDate,
      endDate,
      time,
      pageIds
    } = req.body;

    // 🔴 Validation
    if (
      !userId ||
      !prompt ||
      !startDate ||
      !endDate ||
      !time ||
      !pageIds?.length
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 🔴 Verify social accounts belong to user
    const accounts = await SocialAccount.find({
      _id: { $in: pageIds },
      user: userId
    });

    if (!accounts.length) {
      return res.status(400).json({
        message: "Invalid social accounts"
      });
    }

    // 🔥 Create first run datetime
    const nextRunAt = new Date(`${startDate}T${time}:00`);

    await Automation.create({
      userId,
      prompt,

      startDate: new Date(startDate),
      endDate: new Date(endDate),

      time,
      pageIds,
      nextRunAt,
      status: "active"
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Automation creation failed" });
  }
};
/*
export const getUserAccounts = async (req, res) => {
  console.log("Fetching accounts for user:", req.params);
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ msg: "User ID is required" });

    const accounts = await SocialAccount.find({ user: String(userId) });

    res.json({ data: accounts });
  } catch (err) {
    console.error("Error fetching user accounts:", err);
    res.status(500).json({ msg: "Failed to fetch accounts" });
  }
};
*/

export const getUserAccounts = async (req, res) => {
  try {
    console.log("Fetching all accounts for user:", req.params);
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ msg: "User ID is required" });
    }

    const [socialAccounts, twitterAccounts] = await Promise.all([
      SocialAccount.find({ user: String(userId) }).lean(),
      TwitterAccount.find({ user: String(userId) }).lean()
    ]);

    const accounts = [
      ...socialAccounts.map(a => ({
        ...a,
        platform: a.platform,   // facebook / instagram
        source: "social"
      })),
      ...twitterAccounts.map(a => ({
        ...a,
        platform: "twitter",
        source: "twitter"
      }))
    ];

    res.json({ data: accounts });
  } catch (err) {
    console.error("Error fetching all user accounts:", err);
    res.status(500).json({ msg: "Failed to fetch accounts" });
  }
};

export const universalPublish = async (req, res) => {
  try {
    console.log("🔥 UNIVERSAL PUBLISH HIT 🔥");
    console.log("REQ BODY:", req.body);
    console.log("REQ FILE:", req.file);
    const {
      platform,
      userId,
      message,
      pageIds,
      scheduleTime
    } = req.body;

    const parsedPageIds = pageIds ? JSON.parse(pageIds) : [];

    console.log("📦 PARSED PAGE IDS:", parsedPageIds);

    const media = req.file || null;

    if (!platform || !userId) {
      console.warn("❌ Missing platform or userId");
      return res.status(400).json({ msg: "platform and userId required" });
    }

    /* =========================
       FACEBOOK
    ========================= */
    if (platform === "facebook") {
      console.log("➡️ FACEBOOK FLOW");

      if (!parsedPageIds.length) {
        return res.status(400).json({ msg: "pageIds required" });
      }

      const results = [];

      for (const pageId of parsedPageIds) {
        console.log("📄 Posting to Facebook page:", pageId);

        const acc = await SocialAccount.findOne({
          providerId: pageId,
          platform: "facebook",
        });

        if (!acc) {
          console.warn("❌ Facebook page not connected:", pageId);
          continue;
        }

        const mediaUrl = media ? media.path : null;
        const mediaType = media
          ? media.mimetype.startsWith("video")
            ? "video"
            : "image"
          : null;

        console.log({ pageId, mediaUrl, mediaType });

        const fbResult = await publishToPage({
          pageAccessToken: acc.accessToken,
          pageId,
          message,
          mediaUrl,
          mediaType,
          scheduleTime,
        });

        console.log("🚀 FB RESULT for page", pageId, fbResult);

        await PostedPost.create({
          user: userId,
          platform: "facebook",
          pageId,
          message,
          mediaUrl,
          mediaType,
          status: scheduleTime ? "scheduled" : "posted",
          providerPostId: fbResult?.id || null,
        });

        results.push({
          pageId,
          postId: fbResult?.id || null,
        });
      }

      console.log("✅ Facebook posting completed for all pages");

      return res.json({
        success: true,
        platform: "facebook",
        results,
      });
    }

    /* =========================
       INSTAGRAM
    ========================= */
    if (platform === "instagram") {
      console.log("➡️ INSTAGRAM FLOW STARTED");

      if (!parsedPageIds.length || !media) {
        return res.status(400).json({ msg: "pageIds & media required" });
      }

      const results = [];

      for (const pageId of parsedPageIds) {
        console.log("📸 Posting to Instagram account:", pageId);

        const acc = await SocialAccount.findOne({
          providerId: pageId,
          platform: "instagram",
        });

        if (!acc) {
          console.warn("❌ Instagram not connected:", pageId);
          continue;
        }

        const mediaType = media.mimetype.startsWith("video") ? "video" : "image";
        const mediaUrl = media.path;

        console.log({ pageId, mediaUrl, mediaType });

        const igResult = await publishInstagramUtil({
          igUserId: acc.providerId,
          accessToken: acc.accessToken,
          mediaUrl,
          mediaType,
          caption: message,
        });

        console.log("🚀 IG RESULT:", igResult);

        await PostedPost.create({
          user: userId,
          platform: "instagram",
          pageId,
          message,
          mediaUrl,
          mediaType,
          status: "posted",
          providerPostId: igResult.postId,
        });

        results.push({
          pageId,
          postId: igResult.postId,
        });
      }

      console.log("✅ Instagram posting completed");

      return res.json({
        success: true,
        platform: "instagram",
        results,
      });
    }
    /* =========================
       TWITTER
    ========================= */
    if (platform === "twitter") {
      console.log("➡️ TWITTER FLOW");

      if (!message) {
        console.warn("❌ Tweet content missing");
        return res.status(400).json({ msg: "Tweet content required" });
      }

      const acc = await TwitterAccount.findOne({
        user: userId,
        platform: "twitter",
      });

      if (!acc) {
        console.warn("❌ Twitter not connected for user");
        return res.status(401).json({ msg: "Twitter not connected" });
      }

      console.log("TWITTER ACCOUNT:", acc);
      console.log("TWEET CONTENT:", message);

      // 👉 twitter post logic
      // const tweet = await client.v2.tweet(message);
      // console.log("TWEET RESULT:", tweet);

      await post.create({
        user: userId,
        platform: "twitter",
        message,
        status: "posted",
      });

      console.log("✅ Tweet saved to DB");
      return res.json({ success: true, platform: "twitter" });
    }

    /* =========================
       LINKEDIN
    ========================= */
    if (platform === "linkedin") {
      console.log("➡️ LINKEDIN FLOW");

      if (!message) {
        console.warn("❌ LinkedIn content missing");
        return res.status(400).json({ msg: "Content required" });
      }

      const acc = await SocialAccount.findOne({
        user: userId,
        platform: "linkedin",
      });

      if (!acc) {
        console.warn("❌ LinkedIn not connected for user");
        return res.status(401).json({ msg: "LinkedIn not connected" });
      }

      console.log("LINKEDIN ACCOUNT:", acc);
      console.log("LINKEDIN CONTENT:", message);

      // 👉 linkedin post logic
      // const linkedinRes = await axios.post(...);
      // console.log("LINKEDIN API RESULT:", linkedinRes.data);

      await PostedPost.create({
        user: userId,
        platform: "linkedin",
        message,
        status: "posted",
      });

      console.log("✅ LinkedIn post saved to DB");
      return res.json({ success: true, platform: "linkedin" });
    }

    console.warn("❌ Invalid platform received:", platform);
    return res.status(400).json({ msg: "Invalid platform" });

  } catch (err) {
    console.error("❌ UNIVERSAL ERROR:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const waitForMediaReady = async (creationId, accessToken) => {
  let status = "IN_PROGRESS";
  let attempts = 0;

  while (status !== "FINISHED" && attempts < 10) {
    await new Promise((r) => setTimeout(r, 3000)); // ⏳ wait 3 sec

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
    console.log("⏳ IG MEDIA STATUS:", status);
    attempts++;
  }

  if (status !== "FINISHED") {
    throw new Error("Media processing timeout");
  }
};
