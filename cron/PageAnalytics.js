const cron = require("node-cron");
const axios = require("axios");
const SocialAccount = require("../models/socialAccount.js");
const PageAnalytics = require("../models/PageAnalytics.js");

const METRIC_GROUPS = {
  followers: "page_fans",
  impressions: "page_impressions",
  reach: "page_impressions_unique",
  engagement: "page_engaged_users",
};

cron.schedule("*/2 * * * *", async () => {
  console.log("📊 Page analytics cron started");

  const pages = await SocialAccount.find({ platform: "facebook" });

  for (const page of pages) {
    const today = new Date().toISOString().split("T")[0];

    let analytics = {
      followers: 0,
      impressions: 0,
      reach: 0,
      engagement: 0,
    };

    for (const [key, metric] of Object.entries(METRIC_GROUPS)) {
      try {
        const res = await axios.get(
          `https://graph.facebook.com/v18.0/${page.providerId}/insights`,
          {
            params: {
              metric,
              period: "day",
              access_token: page.accessToken,
            },
          }
        );

        analytics[key] =
          res.data?.data?.[0]?.values?.[0]?.value || 0;
      } catch (err) {
        console.error(
          `⚠️ Metric failed (${metric}) for page ${page.providerId}:`,
          err.response?.data || err.message
        );
      }
    }

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

      console.log(`✅ Saved analytics for page ${page.providerId}`);
    } catch (err) {
      console.error("❌ DB save error:", err.message);
    }
  }
});