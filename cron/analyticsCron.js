// cron/analyticsCron.js
import mongoose from "mongoose";
import cron from "node-cron";
import PublishedPost from "../models/PublishedPost.js";
import { fetchAnalyticsForPost } from "../utils/fetchAnalytics.js";
import dotenv from "dotenv";
dotenv.config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected for analytics cron"));

cron.schedule("*/2 * * * *", async () => {
  console.log("🔄 Analytics cron running (every 2 minutes)...");

  const posts = await PublishedPost.find({
    status: "published",
  });

  for (const post of posts) {
    if (!post.postId) continue;

    try {
      const analytics = await fetchAnalyticsForPost(post);

      if (!analytics) continue;

      // 🔥 ALWAYS PUSH LATEST ANALYTICS
      post.analytics = {
        ...post.analytics,
        ...analytics,
      };

      post.lastAnalyticsSyncAt = new Date();
      post.analyticsStatus = "synced"; // optional, for UI only

      await post.save();

      // Optional delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error("❌ Analytics error:", err.message);
    }
  }
});
