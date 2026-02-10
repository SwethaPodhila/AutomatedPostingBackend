const mongoose = require("mongoose");

const PageAnalyticsSchema = new mongoose.Schema({
    socialAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SocialAccount",
        required: true,
    },

    platform: {
        type: String,
        default: "facebook",
    },

    providerId: String, // FB Page ID (duplicate for fast query)

    followers: Number,
    impressions: Number,
    reach: Number,
    engagement: Number,

    // ✅ New page-level metrics
    page_post_engagements: Number,
    page_views_total: Number,

    date: {
        type: String, // "YYYY-MM-DD"
        required: true,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("PageAnalytics", PageAnalyticsSchema);
