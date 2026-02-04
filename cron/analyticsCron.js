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
  console.log("🔄 Analytics cron running...");

  const posts = await PublishedPost.find({
    status: "published",
  });

  for (const post of posts) {
    try {
      const analytics = await fetchAnalyticsForPost(post);

      post.analytics = analytics;
      post.analyticsStatus = "synced";
      post.lastAnalyticsSyncAt = new Date();

      await post.save();

      console.log("✅ Analytics saved:", post.postId);
    } catch (err) {
      post.analyticsStatus = "failed";
      post.errorMessage = err.message;
      await post.save();

      console.error("❌ Analytics failed:", err.message);
    }
  }
});
