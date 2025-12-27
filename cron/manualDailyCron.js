import cron from "node-cron";
import AutoManual from "../models/AutoManual.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";
import { publishToPage } from "../utils/FbApis.js";
import { publishInstagramUtil } from "../utils/instagramApi.js";
import { publishToLinkedIn } from "../utils/linkedinApi.js";

import Automation from "../models/Automation.js";
import { generateAICaptionAndImage } from "../utils/aiAutomation.js";
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
          await publishToPage({
            pageAccessToken: acc.accessToken,
            pageId: post.pageId,
            message: post.message,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
          });
        }

        if (post.platform === "instagram") {
          await publishInstagramUtil({
            igUserId: acc.providerId,
            accessToken: acc.accessToken,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType,
            caption: post.message,
          });
        }

        if (post.platform === "linkedin") {
          await publishToLinkedIn({
            accessToken: acc.accessToken,
            providerId: acc.providerId,   // 🔥 REQUIRED
            content: post.message,        // 🔥 correct key
            mediaPath: post.mediaUrl || null,
            mediaType: post.mediaType || null,
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
          await publishToPage({
            pageAccessToken: acc.accessToken,
            pageId: auto.pageId,
            message: caption,
            mediaUrl: mediaUrl || null,
            mediaType: mediaUrl ? "image" : null,
          });
        }

        if (auto.platform === "instagram") {
          if (!mediaUrl) continue; // Instagram needs image
          await publishInstagramUtil({
            igUserId: acc.providerId,
            accessToken: acc.accessToken,
            mediaUrl: mediaUrl,
            mediaType: "image",
            caption,
          });
        }

        if (auto.platform === "linkedin") {
          await publishToLinkedIn({
            accessToken: acc.accessToken,
            providerId: acc.providerId,
            content: caption,
            mediaPath: mediaUrl || null,
            mediaType: mediaUrl ? "image" : null,
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
