import Automation from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";
import AutoManual from "../models/AutoManual.js";
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
        platform: a.platform,        // facebook / instagram
        providerId: a.providerId,
        source: "social"
      })),

      ...twitterAccounts.map(a => ({
        ...a,
        platform: a.platform,        // 🔥 twitter / linkedin
        providerId: a.providerId || a.meta?.twitterId || a.meta?.linkedinId,
        source: "oauth"
      }))
    ].filter(a => a.providerId);     // 🔥 safety

    res.json({ data: accounts });
  } catch (err) {
    console.error("Error fetching all user accounts:", err);
    res.status(500).json({ msg: "Failed to fetch accounts" });
  }
};

export const universalPublish = async (req, res) => {
  try {
    const {
      platform,
      userId,
      message,
      pageIds,
      startDate,
      endDate,
      times
    } = req.body;

    // ✅ SAFE PARSING
    const parsedPageIds =
      typeof pageIds === "string" ? JSON.parse(pageIds) : pageIds || [];

    const parsedTimes =
      typeof times === "string" ? JSON.parse(times) : times || [];

    const media = req.file || null;

    const normalizedStartDate = startDate ? new Date(startDate) : null;
    const normalizedEndDate = endDate ? new Date(endDate) : null;

    if (!platform || !userId) {
      return res.status(400).json({ msg: "platform and userId required" });
    }

    // ================= FACEBOOK =================
    if (platform === "facebook") {
      for (const pageId of parsedPageIds) {

        const acc = await SocialAccount.findOne({
          providerId: pageId,
          platform: "facebook",
        });

        if (!acc) continue;

        const mediaUrl = media ? media.path : null;
        const mediaType = media
          ? media.mimetype.startsWith("video")
            ? "video"
            : "image"
          : null;

        // 🔥 IMMEDIATE
        if (!normalizedStartDate && !normalizedEndDate && !parsedTimes.length) {

          const fbRes = await publishToPage({
            pageAccessToken: acc.accessToken,
            pageId,
            message,
            mediaUrl,
            mediaType,
          });

          await AutoManual.create({
            user: userId,
            platform: "facebook",
            pageId,
            message,
            mediaUrl,
            mediaType,
            postId: fbRes?.id,
            status: "posted",
          });

        } else {

          await AutoManual.create({
            user: userId,
            platform: "facebook",
            pageId,
            message,
            mediaUrl,
            mediaType,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            times: parsedTimes,
            status: "scheduled",
          });
        }
      }

      return res.json({ success: true, platform: "facebook" });
    }

    // ================= INSTAGRAM =================
    if (platform === "instagram") {

      if (!media) {
        return res.status(400).json({ msg: "Media required for Instagram" });
      }

      for (const pageId of parsedPageIds) {

        const acc = await SocialAccount.findOne({
          providerId: pageId,
          platform: "instagram",
        });

        if (!acc) continue;

        const mediaType = media.mimetype.startsWith("video") ? "video" : "image";
        const mediaUrl = media.path;

        // 🔥 IMMEDIATE
        if (!normalizedStartDate && !normalizedEndDate && !parsedTimes.length) {

          const igRes = await publishInstagramUtil({
            igUserId: acc.providerId,
            accessToken: acc.accessToken,
            mediaUrl,
            mediaType,
            caption: message,
          });

          await AutoManual.create({
            user: userId,
            platform: "instagram",
            pageId,
            message,
            mediaUrl,
            mediaType,
            postId: igRes?.postId,
            status: "posted",
          });

        } else {

          await AutoManual.create({
            user: userId,
            platform: "instagram",
            pageId,
            message,
            mediaUrl,
            mediaType,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            times: parsedTimes,
            status: "scheduled",
          });
        }
      }

      return res.json({ success: true, platform: "instagram" });
    }

    return res.status(400).json({ msg: "Invalid platform" });

  } catch (err) {
    console.error("🔥 PUBLISH ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};
