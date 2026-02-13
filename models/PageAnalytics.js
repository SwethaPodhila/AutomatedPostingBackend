const mongoose = require("mongoose");

const PageAnalyticsSchema = new mongoose.Schema({
  socialAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SocialAccount",
    required: true,
  },
 
  platform: {
    type: String,
    enum: ["facebook", "instagram"],
    required: true,
  },

  providerId: String,

  // ======================
  // FACEBOOK METRICS
  // ======================
  page_post_engagements: { type: Number, default: 0 },
  page_views_total: { type: Number, default: 0 },

  // ======================
  // INSTAGRAM METRICS
  // ======================
  reach: { type: Number, default: 0 },
  follower_count: { type: Number, default: 0 },
  online_followers: { type: Number, default: 0 },

  date: {
    type: String, // YYYY-MM-DD
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("PageAnalytics", PageAnalyticsSchema);
