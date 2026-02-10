const cron = require("node-cron");
const axios = require("axios");
const SocialAccount = require("../models/socialAccount.js");
const PageAnalytics = require("../models/PageAnalytics.js");

// Only the two page-level metrics
const PAGE_METRICS = ["page_post_engagements", "page_views_total"];

cron.schedule("0 */6 * * *", async () => {
  console.log("📊 Page-level daily analytics cron started (every 6 hours)");

  try {
    // Fetch all connected Facebook pages
    const pages = await SocialAccount.find({ platform: "facebook" });

    for (const page of pages) {
      const today = new Date().toISOString().split("T")[0];

      let analytics = {};

      for (const metric of PAGE_METRICS) {
        try {
          const res = await axios.get(
            `https://graph.facebook.com/v19.0/${page.providerId}/insights`,
            {
              params: {
                metric,
                period: "day",
                access_token: page.accessToken,
              },
            }
          );

          analytics[metric] =
            res.data?.data?.[0]?.values?.[0]?.value || 0;
        } catch (err) {
          console.error(
            `⚠️ Failed fetching metric (${metric}) for page ${page.providerId}:`,
            err.response?.data || err.message
          );
          analytics[metric] = 0; // fallback to 0
        }
      }

      // Save analytics to DB
      try {
        await PageAnalytics.updateOne(
          {
            socialAccount: page._id,
            providerId: page.providerId,
            date: today,
          },
          {
            $set: {
              platform: "facebook",
              ...analytics,
            },
          },
          { upsert: true }
        );

        console.log(`✅ Saved daily analytics for page ${page.providerId}`);
      } catch (err) {
        console.error("❌ DB save error for page", page.providerId, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
});