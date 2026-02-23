import cron from "node-cron";
import AutoManual from "../models/AutoManual.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";

import { publishToPage } from "../utils/FbApis.js";
import { publishInstagramUtil } from "../utils/instagramApi.js";
import { publishToLinkedIn } from "../utils/linkedinApi.js";
import { postToTelegram } from "../utils/telegram.js"
import { publishToPinterest } from "../utils/pinterest.js";
import { publishToBlueskyWithImage } from "../utils/publishToBluesky.js";

import Automation from "../models/Automation.js";
import { generateAICaptionAndImage } from "../utils/aiAutomation.js";
import PublishedPost from "../models/PublishedPost.js";
import fs from "fs";

// 🔁 Runs every minute
cron.schedule("* * * * *", async () => {
  try {
    // 🇮🇳 IST time
    const istNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    const currentTime = istNow.toTimeString().slice(0, 5); // HH:mm
    const todayStr = istNow.toLocaleDateString("en-CA"); // YYYY-MM-DD

    console.log("⏰ Cron Running");
    console.log("📅 IST Date:", todayStr);
    console.log("🕒 IST Time:", currentTime);

    // 1️⃣ Fetch scheduled posts for this minute
    const posts = await AutoManual.find({
      status: "scheduled",
      times: currentTime,
    });

    console.log(`📌 Time matched posts: ${posts.length}`);

    for (const post of posts) {
      try {
        // 2️⃣ Date range check
        const startDateStr = new Date(post.startDate).toLocaleDateString("en-CA");
        const endDateStr = new Date(post.endDate).toLocaleDateString("en-CA");

        if (todayStr < startDateStr || todayStr > endDateStr) {
          console.log("⏭ Skipped (date not in range)");
          continue;
        }

        // 🚫 IMPORTANT:
        // ❌ lastRunAt duplicate logic REMOVED
        // because same post may have multiple pages

        // 3️⃣ Account lookup
        let acc = await SocialAccount.findOne({
          providerId: post.pageId,
          platform: post.platform,
        });

        if (!acc && post.platform === "linkedin") {
          acc = await TwitterAccount.findOne({
            providerId: post.pageId,
            platform: "linkedin",
          });
        }

        if (!acc) {
          console.log("❌ Account not found:", post.pageId, post.platform);
          continue;
        }

        console.log("✅ Found account:", acc.meta?.username || acc.user);
        console.log("🚀 Posting to", post.platform);

        // 4️⃣ Publish
        if (post.platform === "facebook") {
          const fbRes = await publishToPage({
            pageAccessToken: acc.accessToken,
            pageId: post.pageId,
            message: post.message,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
          });

          const rawId = fbRes.id;

          const postId = rawId.includes("_")
            ? rawId
            : `${post.pageId}_${rawId}`;

          await PublishedPost.create({
            user: post.user,
            platform: "facebook",
            pageId: post.pageId,
            pageName: acc.meta?.username || "",
            caption: post.message,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,

            postId,      // ✅ ALWAYS SAVE
            videoId: null, // ❌ NOT NEEDED

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: post.scheduledTime || null,
            source: "scheduled",
            status: "published",
            analyticsStatus: "pending",
          });
        }

        if (post.platform === "instagram") {

          const igRes = await publishInstagramUtil({
            igUserId: acc.providerId,
            accessToken: acc.accessToken,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
            caption: post.message,
          });

          console.log("🧪 IG POST ID:", igRes.postId);

          await PublishedPost.create({
            user: post.user,
            platform: "instagram",

            pageId: acc.providerId,                 // IG user id
            pageName: acc.meta?.username || "",

            caption: post.message,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,

            postId: igRes.postId,                   // ✅ NOW REAL VALUE
            videoId: post.mediaType === "video" ? igRes.postId : null,

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: post.scheduledTime || null,
            source: "scheduled",
            status: "published",
            analyticsStatus: "pending",
          });

          console.log("✅ Instagram post saved to DB");
        }


        if (post.platform === "linkedin") {
          await publishToLinkedIn({
            accessToken: acc.accessToken,
            providerId: acc.providerId,   // 🔥 REQUIRED
            content: post.message,        // 🔥 correct key
            mediaUrl: post.mediaUrl || null,
            mediaType: post.mediaType || null,
          });
        }

        if (post.platform === "telegram") {

          const tgRes = await postToTelegram({
            botToken: acc.accessToken,
            chatId: post.pageId,
            message: post.message,
            mediaUrl: post.mediaUrl || null,
          });

          if (!tgRes || !tgRes.message_id) {
            throw new Error("Telegram message_id not returned");
          }

          console.log("📨 Telegram Message ID:", tgRes.message_id);

          await PublishedPost.create({
            user: post.user,
            platform: "telegram",

            pageId: tgRes.chat.id.toString(),
            pageName: tgRes.chat.title || "",

            caption: post.message,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaUrl
              ? (post.mediaType || "image")
              : null,

            postId: tgRes.message_id.toString(),
            videoId: null,

            publishedAt: new Date(),
            scheduledAt: post.scheduledTime || null,
            source: "scheduled",
            status: "published",

            analyticsStatus: "pending",   // ✅ correct
          });

          console.log("✅ Telegram post saved in DB");
        }

        // ✅ ADD BLUESKY
        if (post.platform === "bluesky") {
          const bsRes = await publishToBlueskyWithImage({
            service: acc.meta?.service || "https://bsky.social",
            accessJwt: acc.accessToken,
            refreshJwt: acc.refreshToken,
            did: acc.providerId,
            message: post.message,
            imageUrl: post.mediaUrl,
          });

          console.log("🦋 Bluesky Post Response:", bsRes);

          // 🔥 IMPORTANT
          const postUri = bsRes.uri; // THIS IS POST ID

          await PublishedPost.create({
            user: post.user,
            platform: "bluesky",

            pageId: acc.providerId,
            pageName: acc.meta?.handle || "",

            caption: post.message,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType || "image",

            postId: postUri,  // ✅ VERY IMPORTANT
            videoId: null,

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: post.scheduledTime || null,
            source: "scheduled",
            status: "published",
            analyticsStatus: "pending",

            analytics: {
              like_count: 0,
              repost_count: 0,
              reply_count: 0,
              quote_count: 0,
            }
          });

          console.log("✅ Bluesky post saved to DB");
        }


        // ✅ ADD PINTEREST
        if (post.platform === "pinterest") {
          await publishToPinterest({
            accessToken: acc.accessToken,
            boardId: post.pageId,
            title: "Automated Post",
            description: post.message,
            imageUrl: post.mediaUrl,
            link: null,
          });
        }

        // 5️⃣ Mark as completed
        post.status = "completed";
        post.lastRunAt = istNow;
        await post.save();

        console.log("✅ Post Published Successfully");

      } catch (err) {
        console.error("❌ Post Error:", err.message);

        post.status = "failed";
        post.errorMessage = err.message;
        await post.save();
      }
    }


    /* =====================================================
         🤖 AI AUTOMATION POSTS
      ===================================================== */

    const automations = await Automation.find({
      status: "scheduled",
      times: currentTime,
    });

    console.log(`🤖 Automations: ${automations.length}`);

    for (const auto of automations) {
      try {
        const startDateStr = new Date(auto.startDate).toLocaleDateString("en-CA");
        const endDateStr = new Date(auto.endDate).toLocaleDateString("en-CA");

        if (todayStr < startDateStr || todayStr > endDateStr) continue;

        // 🔒 Prevent duplicate same minute
        if (
          auto.lastRunAt &&
          auto.lastRunAt.toLocaleDateString("en-CA") === todayStr &&
          auto.lastRunAt.toTimeString().slice(0, 5) === currentTime
        ) {
          continue;
        }

        let acc = await SocialAccount.findOne({
          providerId: auto.pageId,
          platform: auto.platform,
        });

        if (!acc && auto.platform === "linkedin") {
          acc = await TwitterAccount.findOne({
            providerId: auto.pageId,
            platform: "linkedin",
          });
        }

        if (!acc) continue;

        console.log("🤖 Automation posting to", auto.platform);

        // 🧠 AI GENERATION (FIXED)
        const { caption, mediaUrl } =
          await generateAICaptionAndImage(auto.prompt);

        // 🚀 PUBLISH
        if (auto.platform === "facebook") {
          const fbRes = await publishToPage({
            pageAccessToken: acc.accessToken,
            pageId: auto.pageId,
            message: caption,
            mediaUrl: mediaUrl || null,
            mediaType: mediaUrl ? "image" : null,
          });

          const rawId = fbRes.id;

          const postId = rawId.includes("_")
            ? rawId
            : `${auto.pageId}_${rawId}`;

          await PublishedPost.create({
            user: auto.user,
            platform: "facebook",
            pageId: auto.pageId,
            pageName: acc.meta?.username || "",
            caption,
            mediaUrl,
            mediaType: mediaUrl ? "image" : null,

            postId,
            videoId: null,

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: auto.scheduledTime || null,
            source: "automation",   // 🔥 DIFFERENCE HERE
            status: "published",
            analyticsStatus: "pending",
          });
        }

        if (auto.platform === "instagram") {

          if (!mediaUrl) continue; // Instagram requires image

          const igRes = await publishInstagramUtil({
            igUserId: acc.providerId,
            accessToken: acc.accessToken,
            mediaUrl: mediaUrl,
            mediaType: "image",
            caption,
          });

          console.log("🧪 IG Automation Post ID:", igRes.postId);

          await PublishedPost.create({
            user: auto.user,
            platform: "instagram",

            pageId: acc.providerId,
            pageName: acc.meta?.username || "",

            caption,
            mediaUrl,
            mediaType: "image",

            postId: igRes.postId,
            videoId: null,

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: auto.scheduledTime || null,
            source: "automation",   // 🔥 important
            status: "published",
            analyticsStatus: "pending",
          });

          console.log("✅ Instagram automation saved to DB");
        }

        if (auto.platform === "linkedin") {
          await publishToLinkedIn({
            accessToken: acc.accessToken,
            providerId: acc.providerId,
            content: caption,
            mediaUrl: mediaUrl || null,
            mediaType: mediaUrl ? "image" : null,
          });
        }

        // ✅ ADD THIS
        if (auto.platform === "telegram") {

          const tgRes = await postToTelegram({
            botToken: acc.accessToken,
            chatId: auto.pageId,
            message: caption,
            mediaUrl: mediaUrl || null,
          });

          if (!tgRes || !tgRes.message_id) {
            throw new Error("Telegram message_id not returned");
          }

          console.log("📨 Telegram Automation Message ID:", tgRes.message_id);

          await PublishedPost.create({
            user: auto.user,
            platform: "telegram",

            pageId: tgRes.chat.id.toString(),
            pageName: tgRes.chat.title || "",

            caption,
            mediaUrl,
            mediaType: mediaUrl ? "image" : null,

            postId: tgRes.message_id.toString(),
            videoId: null,

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: auto.scheduledTime || null,
            source: "automation",
            status: "published",
            analyticsStatus: "pending",
          });

          console.log("✅ Telegram automation saved to DB");
        }

        // aDD BLUESKY
        if (auto.platform === "bluesky") {

          const bsRes = await publishToBlueskyWithImage({
            service: acc.meta?.service || "https://bsky.social",
            accessJwt: acc.accessToken,
            refreshJwt: acc.refreshToken,
            did: acc.providerId,
            message: caption,
            imageUrl: mediaUrl,
          });

          console.log("🦋 Bluesky Automation Response:", bsRes);

          const postUri = bsRes.uri; // 🔥 This is the post ID

          await PublishedPost.create({
            user: auto.user,
            platform: "bluesky",

            pageId: acc.providerId,
            pageName: acc.meta?.handle || "",

            caption,
            mediaUrl,
            mediaType: mediaUrl ? "image" : null,

            postId: postUri,
            videoId: null,

            isPaid: false,
            publishedAt: new Date(),
            scheduledAt: auto.scheduledTime || null,
            source: "automation",
            status: "published",
            analyticsStatus: "pending",

            analytics: {
              like_count: 0,
              repost_count: 0,
              reply_count: 0,
              quote_count: 0,
            }
          });

          console.log("✅ Bluesky automation saved to DB");
        }

        // ✅ ADD PINTEREST
        if (auto.platform === "pinterest") {
          await publishToPinterest({
            accessToken: acc.accessToken,
            boardId: auto.pageId,
            title: "Automated Post",
            description: caption,
            imageUrl: mediaUrl,
            link: null,
          });
        }

        auto.lastRunAt = istNow;
        if (todayStr === endDateStr) auto.status = "completed";
        await auto.save();

        console.log("✅ Automation post done");
      } catch (err) {
        console.error("❌ Automation error:", err.message);
      }
    }
  }


  catch (err) {
    console.error("🔥 Cron Crash:", err);
  }
});

