import cron from "node-cron";
import AutoManual from "../models/AutoManual.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";
import { publishToPage } from "../utils/FbApis.js";
import { publishInstagramUtil } from "../utils/instagramApi.js";
import { publishToLinkedIn } from "../utils/linkedinApi.js";

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
  } catch (err) {
    console.error("🔥 Cron Crash:", err);
  }
});
