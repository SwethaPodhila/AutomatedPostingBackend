import Automation from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";
import AutoManual from "../models/AutoManual.js";
import post from "../models/Post.js";
import { publishToPage } from "../utils/FbApis.js";

import { publishInstagramUtil } from "../utils/instagramApi.js";
import { publishToLinkedIn } from "../utils/linkedinApi.js";
import { postToTelegram } from "../utils/telegram.js";
import { publishToPinterest } from "../utils/pinterest.js";
import { publishToBlueskyWithImage } from "../utils/publishToBluesky.js";

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


    // ================= TELEGRAM =================
    if (platform === "telegram") {

      console.log("🟢 ENTERED TELEGRAM BLOCK");

      for (const chatId of parsedPageIds) {

        const acc = await SocialAccount.findOne({
          user: userId,
          platform: "telegram",
          providerId: chatId,
        });

        console.log("🔍 Telegram acc for", chatId, acc);

        // ❗ IMPORTANT: do NOT continue silently
        if (!acc) {
          console.log("❌ Telegram account NOT FOUND in DB");
          continue;
        }

        const mediaUrl = media ? media.path : null;

        // 🔥 IMMEDIATE POST
        if (!normalizedStartDate && !normalizedEndDate && !parsedTimes.length) {

          await postToTelegram({
            botToken: acc.accessToken,
            chatId,
            message,
            mediaUrl,
          });

          console.log("💾 Saving Telegram POSTED");

          await AutoManual.create({
            user: userId,
            platform: "telegram",
            pageId: chatId,
            message,
            mediaUrl,
            status: "posted",
          });

        }
        // ⏰ SCHEDULED
        else {

          console.log("💾 Saving Telegram SCHEDULED");

          await AutoManual.create({
            user: userId,
            platform: "telegram",
            pageId: chatId,
            message,
            mediaUrl,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            times: parsedTimes,
            status: "scheduled",
          });
        }
      }

      return res.json({ success: true, platform: "telegram" });
    }

    // ================= BLUESKY =================
    if (platform === "bluesky") {

      console.log("🔵 ENTERED BLUESKY BLOCK");
      console.log("📦 REQ.FILE:", req.file);
      console.log("📝 MESSAGE:", message);
      console.log("📅 START:", normalizedStartDate);
      console.log("📅 END:", normalizedEndDate);
      console.log("⏰ TIMES:", parsedTimes);

      const acc = await SocialAccount.findOne({
        user: userId,
        platform: "bluesky",
      });

      console.log("🔑 BLUESKY ACCOUNT:", acc ? "FOUND" : "NOT FOUND");

      if (!acc) {
        return res.status(400).json({ error: "Bluesky account not connected" });
      }

      const media = req.file || null;

      // ================= IMMEDIATE =================
      if (!normalizedStartDate && !normalizedEndDate && !parsedTimes.length) {

        console.log("⚡ BLUESKY IMMEDIATE MODE");

        let postRes;

        try {
          if (media) {
            console.log("🖼️ IMAGE POST");

            postRes = await publishToBlueskyWithImage({
              service: acc.meta?.service,
              did: acc.providerId,
              accessJwt: acc.accessToken,
              refreshJwt: acc.refreshToken,
              message,
              imageUrl: media.path, // Cloudinary URL
            });

          } else {
            console.log("📝 TEXT POST");

            postRes = await publishToBluesky({
              service: acc.meta?.service,
              did: acc.providerId,
              accessJwt: acc.accessToken,
              refreshJwt: acc.refreshToken,
              message,
            });
          }

          console.log("✅ BLUESKY POSTED:", postRes?.uri);

          await AutoManual.create({
            user: userId,
            platform: "bluesky",
            pageId: acc.providerId,
            message,
            mediaUrl: media?.path || null,
            postId: postRes.uri,
            status: "posted",
          });

          console.log("💾 DB SAVED (POSTED)");

        } catch (err) {
          console.error("❌ BLUESKY ERROR:", err);
          return res.status(500).json({ error: "Bluesky post failed" });
        }
      }

      // ================= SCHEDULE =================
      else {
        console.log("⏰ BLUESKY SCHEDULE MODE");

        await AutoManual.create({
          user: userId,
          platform: "bluesky",
          pageId: acc.providerId,
          message,
          mediaUrl: media?.path || null,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          times: parsedTimes,
          status: "scheduled",
        });

        console.log("💾 DB SAVED (SCHEDULED)");
      }

      return res.json({ success: true, platform: "bluesky" });
    }

    // ================= PINTEREST =================
    if (platform === "pinterest") {

      console.log("📌 ENTERED PINTEREST BLOCK");

      if (!media) {
        return res.status(400).json({ msg: "Image required for Pinterest" });
      }

      for (const boardId of parsedPageIds) {

        const acc = await SocialAccount.findOne({
          user: userId,
          platform: "pinterest",
          providerId: boardId,
        });

        if (!acc) {
          console.log("❌ Pinterest account not found for board:", boardId);
          continue;
        }

        const mediaUrl = media.path; // must be PUBLIC URL (S3 / Cloudinary)

        // 🔥 IMMEDIATE POST
        if (!normalizedStartDate && !normalizedEndDate && !parsedTimes.length) {

          console.log("📤 Publishing PIN");

          const pinRes = await publishToPinterest({
            accessToken: acc.accessToken,
            boardId,
            title: message?.slice(0, 100),
            description: message,
            imageUrl: mediaUrl,
            link: "https://automatedpostingsfrontend-7d5o.onrender.com", // optional
          });

          await AutoManual.create({
            user: userId,
            platform: "pinterest",
            pageId: boardId,
            message,
            mediaUrl,
            postId: pinRes.id,
            status: "posted",
          });

        }
        // ⏰ SCHEDULE
        else {

          try {
            await AutoManual.create({
              user: userId,
              platform: "pinterest",
              pageId: boardId,
              message,
              mediaUrl,
              startDate: normalizedStartDate,
              endDate: normalizedEndDate,
              times: parsedTimes,
              status: "scheduled",
            });
            console.log("✅ Scheduled Pinterest post saved for board:", boardId);
          } catch (err) {
            console.error("❌ DB Save Error:", err);
          }
        }
      }

      return res.json({ success: true, platform: "pinterest" });
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


/* ===============================
   HELPER: GET DATES BETWEEN
================================ */
const getDatesBetween = (start, end) => {
  const dates = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
};

/* ===============================
   WEEKLY CALENDAR CONTROLLER
   Monday → Sunday
================================ */
export const getCalendar = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, view = "weekly" } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "date is required",
      });
    }

    let startOfRange, endOfRange;
    const baseDate = new Date(date);

    /* =======================
       🔹 DATE RANGE LOGIC
    ======================= */
    if (view === "monthly") {
      // Month start & end
      startOfRange = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        1
      );
      endOfRange = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth() + 1,
        0
      );
    } else {
      // Weekly (default)
      startOfRange = new Date(baseDate);
      endOfRange = new Date(baseDate);
      endOfRange.setDate(startOfRange.getDate() + 6);
    }

    let expandedPosts = [];

    /* =======================
       🔹 AUTO MANUAL POSTS
    ======================= */
    const manualSchedules = await AutoManual.find({
      user: userId,
      startDate: { $lte: endOfRange },
      endDate: { $gte: startOfRange },
    });

    manualSchedules.forEach((item) => {
      const validStart =
        item.startDate > startOfRange ? item.startDate : startOfRange;

      const validEnd =
        item.endDate < endOfRange ? item.endDate : endOfRange;

      const dates = getDatesBetween(validStart, validEnd);

      dates.forEach((date) => {
        item.times.forEach((time) => {
          expandedPosts.push({
            source: "manual",
            date: date.toISOString().split("T")[0],
            time,
            platform: item.platform,
            pageId: item.pageId,
            message: item.message,
            mediaUrl: item.mediaUrl,
            mediaType: item.mediaType,
            status: item.status,
          });
        });
      });
    });

    /* =======================
       🔹 AUTOMATION POSTS
    ======================= */
    const automationSchedules = await Automation.find({
      user: userId,
      startDate: { $lte: endOfRange },
      endDate: { $gte: startOfRange },
    });

    automationSchedules.forEach((item) => {
      const validStart =
        item.startDate > startOfRange ? item.startDate : startOfRange;

      const validEnd =
        item.endDate < endOfRange ? item.endDate : endOfRange;

      const dates = getDatesBetween(validStart, validEnd);

      dates.forEach((date) => {
        item.times.forEach((time) => {
          expandedPosts.push({
            source: "automation",
            date: date.toISOString().split("T")[0],
            time,
            platform: item.platform,
            pageId: item.pageId,
            message: item.prompt,
            mediaUrl: null,
            mediaType: null,
            status: item.status,
          });
        });
      });
    });

    return res.json({
      success: true,
      view,
      range: {
        start: startOfRange,
        end: endOfRange,
      },
      data: expandedPosts,
    });
  } catch (error) {
    console.error("Calendar error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};