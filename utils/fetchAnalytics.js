// utils/fetchAnalytics.js
import fetch from "node-fetch";
import SocialAccount from "../models/socialAccount.js";

export async function fetchAnalyticsForPost(post) {
  const socialAccount = await SocialAccount.findOne({
    user: post.user,
    platform: post.platform,
    providerId: post.pageId,
  });

  if (!socialAccount) {
    throw new Error("Social account not connected");
  }

  const accessToken = socialAccount.accessToken;

  let views = 0;

  // 🎥 VIDEO METRICS
  if (post.mediaType === "video" && post.videoId) {
    const insightsRes = await fetch(
      `https://graph.facebook.com/v18.0/${post.videoId}/insights?metric=total_video_views&access_token=${accessToken}`
    );

    const insights = await insightsRes.json();

    views =
      insights?.data?.[0]?.values?.[0]?.value || 0;
  }

  // 👍 LIKES / COMMENTS / SHARES
  const metaRes = await fetch(
    `https://graph.facebook.com/v18.0/${post.postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${accessToken}`
  );

  const meta = await metaRes.json();

  return {
    views,
    likes: meta?.likes?.summary?.total_count || 0,
    comments: meta?.comments?.summary?.total_count || 0,
    shares: meta?.shares?.count || 0,
    reach: 0,
    impressions: 0,
    saves: 0,
  };
}