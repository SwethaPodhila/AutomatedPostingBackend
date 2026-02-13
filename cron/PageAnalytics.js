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
cron.schedule("*/9 * * * *", async () => {
  console.log("📊 FB + IG analytics cron started (every 3 minutes)");

  try {
    const accounts = await SocialAccount.find({
      platform: { $in: ["facebook", "instagram", "telegram", "bluesky"] },
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
            analytics[metric] = 0;
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
            analytics[metric] = 0;
          }
        }
      }

      // =========================
      // TELEGRAM ANALYTICS (SEPARATE)
      // =========================
      if (account.platform === "telegram") {
        try {
          const subscribers = await getTelegramSubscribers(
            account.providerId
          );

          console.log("📢 Telegram subscribers:", subscribers);

          analytics.follower_count = subscribers;

        } catch (err) {
          console.error("⚠️ Telegram analytics failed:", err.message);
          analytics.follower_count = 0;
        }
      }


      // =========================
      // BLUESKY ANALYTICS
      // =========================
      if (account.platform === "bluesky") {
        try {
          const res = await axios.get(
            "https://bsky.social/xrpc/app.bsky.actor.getProfile",
            {
              params: {
                actor: account.providerId, // DID use chesthunam
              },
              headers: {
                Authorization: `Bearer ${account.accessToken}`,
              },
            }
          );

          const profile = res.data;

          console.log("🦋 Bluesky profile:", profile.handle);

          analytics.follower_count = profile.followersCount || 0;
          analytics.following_count = profile.followsCount || 0;
          analytics.posts_count = profile.postsCount || 0;

        } catch (err) {

          // 🔄 TOKEN EXPIRED HANDLING
          if (err.response?.status === 401 && account.refreshToken) {
            try {
              console.log("🔄 Refreshing Bluesky token...");

              const refreshRes = await axios.post(
                "https://bsky.social/xrpc/com.atproto.server.refreshSession",
                {},
                {
                  headers: {
                    Authorization: `Bearer ${account.refreshToken}`,
                  },
                }
              );

              const newAccessToken = refreshRes.data.accessJwt;
              const newRefreshToken = refreshRes.data.refreshJwt;

              // Save new tokens in DB
              account.accessToken = newAccessToken;
              account.refreshToken = newRefreshToken;
              await account.save();

              console.log("✅ Token refreshed. Retrying profile fetch...");

              // Retry profile fetch
              const retryRes = await axios.get(
                "https://bsky.social/xrpc/app.bsky.actor.getProfile",
                {
                  params: {
                    actor: account.providerId,
                  },
                  headers: {
                    Authorization: `Bearer ${newAccessToken}`,
                  },
                }
              );

              const profile = retryRes.data;

              analytics.follower_count = profile.followersCount || 0;
              analytics.following_count = profile.followsCount || 0;
              analytics.posts_count = profile.postsCount || 0;

            } catch (refreshErr) {
              console.error(
                "❌ Bluesky refresh failed:",
                refreshErr.response?.data || refreshErr.message
              );
            }

          } else {
            console.error(
              "⚠️ Bluesky analytics failed:",
              err.response?.data || err.message
            );
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
