import fetch from "node-fetch";
import SocialAccount from "../models/socialAccount.js";
import TelegramBot from "node-telegram-bot-api";

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);//TELEGRAM_BOT_TOKEN

export async function fetchAnalyticsForPost(post) {
  console.log("🔎 START analytics", post?.postId);

  if (!post?.postId) {
    console.warn("⚠️ Skipping analytics — postId missing");
    return null;
  }

  const socialAccount = await SocialAccount.findOne({
    user: post.user,
    platform: post.platform,
    providerId: post.pageId,
  });

  if (!socialAccount) {
    throw new Error("❌ Social account not connected");
  }

  const accessToken = socialAccount.accessToken;

  const analytics = {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,        // FB only
    reach: 0,
    impressions: 0,
    saves: 0,
  };

  /* =========================
     📘 FACEBOOK ANALYTICS
     ========================= */
  if (post.platform === "facebook") {
    const postUrl = `https://graph.facebook.com/v18.0/${post.postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${accessToken}`;

    const postRes = await fetch(postUrl);
    const postData = await postRes.json();

    analytics.likes = postData?.likes?.summary?.total_count || 0;
    analytics.comments = postData?.comments?.summary?.total_count || 0;
    analytics.shares = postData?.shares?.count || 0;

    // 🎥 video views
    if (post.mediaType === "video" && post.videoId) {
      const videoUrl = `https://graph.facebook.com/v18.0/${post.videoId}/insights?metric=total_video_views&period=lifetime&access_token=${accessToken}`;
      const videoRes = await fetch(videoUrl);
      const videoData = await videoRes.json();

      const viewsMetric = videoData?.data?.find(
        (m) => m.name === "total_video_views"
      );

      analytics.views = viewsMetric?.values?.[0]?.value || 0;
    }
  }

  /* =========================
     📸 INSTAGRAM ANALYTICS
     ========================= */
  if (post.platform === "instagram") {
    const metrics =
      post.mediaType === "video"
        ? "impressions,reach,likes,comments,saves,video_views"
        : "impressions,reach,likes,comments,saves";

    const igUrl = `https://graph.facebook.com/v19.0/${post.postId}/insights?metric=${metrics}&access_token=${accessToken}`;

    console.log("📸 IG INSIGHTS URL:", igUrl);

    const igRes = await fetch(igUrl);
    const igData = await igRes.json();

    console.log("📸 IG INSIGHTS RESPONSE:", igData);

    if (igData?.data?.length) {
      for (const metric of igData.data) {
        const value = metric.values?.[0]?.value || 0;

        switch (metric.name) {
          case "likes":
            analytics.likes = value;
            break;
          case "comments":
            analytics.comments = value;
            break;
          case "impressions":
            analytics.impressions = value;
            break;
          case "reach":
            analytics.reach = value;
            break;
          case "saves":
            analytics.saves = value;
            break;
          case "video_views":
            analytics.views = value;
            break;
        }
      }
    }
  }

  /* =========================
   📢 TELEGRAM ANALYTICS
   ========================= */
  if (post.platform === "telegram") {
    try {
      const chatId = post.pageId;   // 🔥 Use DB value
      const messageId = Number(post.postId);

      const response = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getChat?chat_id=${chatId}`
      );

      // 🔥 Correct way to fetch message
      const msgRes = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getMessage?chat_id=${chatId}&message_id=${messageId}`
      );

      const msgData = await msgRes.json();

      console.log("📢 Telegram API Response:", msgData);

      if (msgData?.result?.views !== undefined) {
        analytics.views = msgData.result.views;
      }

    } catch (err) {
      console.error("❌ Telegram fetch error:", err.message);
    }
  }

  console.log("✅ FINAL ANALYTICS:", analytics);
  return analytics;
}
