import cron from "node-cron";
import AutoManual from "../models/AutoManual.js";
import SocialAccount from "../models/socialAccount.js";
import { publishToPage } from "../utils/FbApis.js";
import { publishInstagramUtil } from "../utils/instagramApi.js";

cron.schedule("* * * * *", async () => {
  try {
    // 🇮🇳 IST time
    const istNow = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );

    const currentTime = istNow.toTimeString().slice(0, 5); // HH:mm
    const todayStr = istNow.toISOString().split("T")[0];  // YYYY-MM-DD

    console.log("⏰ Cron Running");
    console.log("📅 IST Date:", todayStr);
    console.log("🕒 IST Time:", currentTime);

    // 1️⃣ First: time + status match
    const posts = await AutoManual.find({
      status: "scheduled",
      times: currentTime,
    });

    console.log(`📌 Time matched posts: ${posts.length}`);

    for (const post of posts) {
      try {
        // 2️⃣ Date range match
        const startDateStr = new Date(post.startDate)
          .toISOString()
          .split("T")[0];

        const endDateStr = new Date(post.endDate)
          .toISOString()
          .split("T")[0];

        // ❌ If today not in range → skip
        if (todayStr < startDateStr || todayStr > endDateStr) {
          console.log("⏭ Skipped (date not in range)");
          continue;
        }

        // 3️⃣ Duplicate protection (same minute)
        if (post.lastRunAt) {
          const diff = (istNow - post.lastRunAt) / 1000;
          if (diff < 60) {
            console.log("⏭ Duplicate skipped");
            continue;
          }
        }

        // 4️⃣ Get social account
        const acc = await SocialAccount.findOne({
          providerId: post.pageId,
          platform: post.platform,
        });

        if (!acc) {
          console.log("❌ Account not found");
          continue;
        }

        console.log("🚀 Posting to", post.platform);

        // 5️⃣ Publish
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

        // 6️⃣ Save last run
        post.lastRunAt = istNow;
        await post.save();

        console.log("✅ Post Published");

      } catch (err) {
        console.error("❌ Post Error:", err.message);
        post.status = "failed";
        await post.save();
      }
    }
  } catch (err) {
    console.error("🔥 Cron Crash:", err);
  }
});