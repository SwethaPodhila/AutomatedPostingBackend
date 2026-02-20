import fetch from "node-fetch";
import SocialAccount from "../models/socialAccount.js";
import { BskyAgent } from "@atproto/api";

export async function fetchAnalyticsForPost(post) {
  console.log("🔎 START analytics", post?.postId);

  if (!post?.postId) {
    console.warn("⚠️ Skipping analytics — postId missing");
    return null;
  }

  // ✅ TELEGRAM SKIP
  if (post.platform === "telegram") {
    console.log("📭 Telegram analytics handled via webhook");
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
    🦋 BLUESKY ANALYTICS
    ========================= */
  if (post.platform === "bluesky") {
    try {
      const socialAccount = await SocialAccount.findOne({
        user: post.user,
        platform: "bluesky",
      });

      if (!socialAccount) throw new Error("Bluesky not connected");

      const agent = new BskyAgent({
        service: socialAccount.meta.service,
      });

      // ✅ Only resume session
      await agent.resumeSession({
        accessJwt: socialAccount.accessToken,
        refreshJwt: socialAccount.refreshToken,
        did: socialAccount.providerId,
      });

      // ✅ VERY IMPORTANT — Save rotated tokens immediately
      if (agent.session) {
        socialAccount.accessToken = agent.session.accessJwt;
        socialAccount.refreshToken = agent.session.refreshJwt;
        await socialAccount.save();
      }

      const uri = post.postId;

      const bsPost = await agent.getPosts({
        uris: [uri],
      });

      if (!bsPost?.data?.posts?.length) {
        throw new Error("Post not found");
      }

      const postData = bsPost.data.posts[0];

      analytics.likes = postData.likeCount ?? 0;
      analytics.comments = postData.replyCount ?? 0;
      analytics.shares = postData.repostCount ?? 0;

    } catch (err) {
      console.error("Bluesky analytics failed:", err.message);
    }
  }

  console.log("✅ FINAL ANALYTICS:", analytics);
  return analytics;
}
