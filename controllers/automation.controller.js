import Automation from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";
import AutoManual from "../models/AutoManual.js";
import post from "../models/Post.js";
import { publishToPage } from "../utils/FbApis.js";

import { publishInstagramUtil } from "../utils/instagramApi.js";
import { publishToLinkedIn } from "../utils/linkedinApi.js";

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

    console.log("REQ BODY RAW:", req.body);
    console.log("REQ FILE RAW:", req.file);

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

    // ================= LINKEDIN =================
    if (platform === "linkedin") {

      console.log("🔵 ENTERED LINKEDIN BLOCK");

      const acc = await TwitterAccount.findOne({
        providerId: parsedPageIds[0],
        platform: "linkedin",
      });

      if (!acc) {
        return res.status(400).json({ error: "LinkedIn account not found" });
      }

      const mediaType = req.file
        ? req.file.mimetype.startsWith("video")
          ? "video"
          : "image"
        : null;

      // ✅ VERY IMPORTANT
      const mediaUrl = req.file ? req.file.path : null;

      // 🔥 IMMEDIATE POST
      if (!normalizedStartDate && !normalizedEndDate && !parsedTimes.length) {

        console.log("📤 Publishing to LinkedIn");

        const liRes = await publishToLinkedIn({
          accessToken: acc.accessToken,
          providerId: acc.providerId,
          content: message,
          mediaUrl,          // ✅ PASS URL
          mediaType,
        });

        await AutoManual.create({
          user: userId,
          platform: "linkedin",
          pageId: acc.providerId,
          message,
          mediaType,
          mediaUrl,          // ✅ SAVED
          postId: liRes.postId,
          postUrl: liRes.postUrl,
          status: "posted",
        });

      }
      // ⏰ SCHEDULE
      else {

        await AutoManual.create({
          user: userId,
          platform: "linkedin",
          pageId: acc.providerId,
          message,
          mediaType,
          mediaUrl,          // ✅ SAVED
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          times: parsedTimes,
          status: "scheduled",
        });
      }

      return res.json({ success: true, platform: "linkedin" });
    }


    return res.status(400).json({ msg: "Invalid platform" });

  } catch (err) {
    console.error("🔥 PUBLISH ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

export const createAutomation = async (req, res) => {
  console.log("🔵 ENTERED AUTOMATION CONTROLLER");

  try {
    const { userId, pageIds, prompt, startDate, endDate, times } = req.body;

    console.log("📦 Raw Request Body:", req.body);

    // ================= VALIDATION =================
    if (!userId) return res.status(400).json({ msg: "Missing userId" });
    if (!pageIds?.length) return res.status(400).json({ msg: "Missing pageIds" });
    if (!prompt) return res.status(400).json({ msg: "Missing prompt" });
    if (!startDate || !endDate) {
      return res.status(400).json({ msg: "Missing startDate or endDate" });
    }
    if (!times?.length || times.some(t => !t)) {
      return res.status(400).json({ msg: "Invalid times array" });
    }

    console.log("✅ Validation passed");
    console.log("🕒 Times array:", times);

    const normalizedStartDate = new Date(startDate);
    const normalizedEndDate = new Date(endDate);

    // ================= CREATE AUTOMATIONS =================
    for (const pageId of pageIds) {

      // 🔍 Find account from BOTH collections
      let acc =
        await SocialAccount.findOne({ providerId: pageId }) ||
        await TwitterAccount.findOne({ providerId: pageId, platform: "linkedin" });

      if (!acc) {
        console.log("⚠️ Account not found for pageId:", pageId);
        continue;
      }

      console.log("✅ Account Found:", {
        pageId,
        platform: acc.platform,
      });

      const automation = await Automation.create({
        user: userId,
        platform: acc.platform,        // 🔥 KEY FIX
        pageId: acc.providerId,
        prompt,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        times,
        status: "scheduled",
      });

      console.log("✅ Automation Created:", automation._id);
    }

    return res.json({
      success: true,
      message: "Automation created successfully",
    });

  } catch (err) {
    console.error("🔥 AUTOMATION CREATE ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};