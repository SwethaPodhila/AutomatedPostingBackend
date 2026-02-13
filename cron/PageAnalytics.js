const cron = require("node-cron");
const axios = require("axios");
const SocialAccount = require("../models/socialAccount.js");
const PageAnalytics = require("../models/PageAnalytics.js");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const getTelegramSubscribers = async (chatId) => {
  try {
    const res = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMemberCount`,
      {
        params: {
          chat_id: chatId,
        },
      }
    );

    return res.data.result || 0;
  } catch (err) {
    console.error(
      "⚠️ Telegram subscriber fetch failed:",
      err.response?.data || err.message
    );
    return 0;
  }
};

// Facebook metrics (daily)
const FB_METRICS = ["page_post_engagements", "page_views_total"];

// Instagram metrics
const IG_DAILY_METRICS = ["reach", "follower_count"];
const IG_LIFETIME_METRICS = ["online_followers"];

// Run every 3 minutes
cron.schedule("*/8 * * * *", async () => {
  console.log("📊 FB + IG analytics cron started (every 3 minutes)");

  try {
    const accounts = await SocialAccount.find({
      platform: { $in: ["facebook", "instagram", "telegram"] },
    });

    for (const account of accounts) {
      const today = new Date().toISOString().split("T")[0];
      let analytics = {};

      // =========================
      // FACEBOOK ANALYTICS
      // =========================
      if (account.platform === "facebook") {
        for (const metric of FB_METRICS) {
          try {
            const res = await axios.get(
              `https://graph.facebook.com/v19.0/${account.providerId}/insights`,
              {
                params: {
                  metric,
                  period: "day",
                  access_token: account.accessToken,
                },
              }
            );

            analytics[metric] =
              res.data?.data?.[0]?.values?.[0]?.value || 0;
          } catch (err) {
            console.error(
              `⚠️ FB metric failed (${metric})`,
              err.response?.data || err.message
            );
            analytics[metric] = 0;
          }
        }
      }

      // =========================
      // INSTAGRAM ANALYTICS
      // =========================
      if (account.platform === "instagram") {
        // DAILY METRICS
        for (const metric of IG_DAILY_METRICS) {
          try {
            const res = await axios.get(
              `https://graph.facebook.com/v19.0/${account.providerId}/insights`,
              {
                params: {
                  metric,
                  period: "day",
                  access_token: account.accessToken,
                },
              }
            );

            analytics[metric] =
              res.data?.data?.[0]?.values?.[0]?.value || 0;
          } catch (err) {
            console.error(
              `⚠️ IG daily metric failed (${metric})`,
              err.response?.data || err.message
            );
            analytics[metric] = 0;
          }
        }

        // =========================
        // TELEGRAM ANALYTICS
        // =========================
        if (account.platform === "telegram") {
          try {
            const subscribers = await getTelegramSubscribers(
              account.providerId // e.g. @swethapodhila OR -1003615921842
            );

            analytics.total_subscribers = subscribers;
          } catch (err) {
            console.error(
              "⚠️ Telegram analytics failed:",
              err.message
            );
            analytics.total_subscribers = 0;
          }
        }

        // LIFETIME METRICS
        for (const metric of IG_LIFETIME_METRICS) {
          try {
            const res = await axios.get(
              `https://graph.facebook.com/v19.0/${account.providerId}/insights`,
              {
                params: {
                  metric,
                  period: "lifetime",
                  access_token: account.accessToken,
                },
              }
            );

            analytics[metric] =
              res.data?.data?.[0]?.values?.[0]?.value || 0;
          } catch (err) {
            console.error(
              `⚠️ IG lifetime metric failed (${metric})`,
              err.response?.data || err.message
            );
            analytics[metric] = 0;
          }
        }
      }

      // =========================
      // SAVE TO DB
      // =========================
      try {
        await PageAnalytics.updateOne(
          {
            socialAccount: account._id,
            providerId: account.providerId,
            date: today,
          },
          {
            $set: {
              platform: account.platform,
              ...analytics,
            },
          },
          { upsert: true }
        );

        console.log(
          `✅ Saved ${account.platform} analytics for ${account.providerId}`
        );
      } catch (err) {
        console.error(
          "❌ DB save error for",
          account.providerId,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("❌ Cron error:", err.message);
  }
});
