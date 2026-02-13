import mongoose from "mongoose";

const PublishedPostSchema = new mongoose.Schema(
  {
    // 🔗 Who owns this post
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 🌐 Platform
    platform: {
      type: String,
      enum: ["facebook", "instagram", "linkedin", "twitter", "pinterest", "telegram", "bluesky"],
      required: true,
      index: true,
    },

    // 📄 Page / Account Info
    pageId: {
      type: String,
      required: true,
      index: true,
    },

    pageName: {
      type: String,
    },

    pageUsername: {
      type: String,
    },

    // 📝 Post Content
    caption: {
      type: String,
    },

    mediaUrl: {
      type: String,
    },

    mediaType: {
      type: String,
      enum: ["image", "video", "carousel", null],
      default: null,
    },

    // 🔑 PLATFORM POST ID (VERY IMPORTANT)
    postId: {
      type: String,
      required: false,   // 👈 IMPORTANT
    },
    videoId: {
      type: String,
      required: false,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    // ⏰ Publish metadata
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    scheduledAt: {
      type: Date,
    },

    source: {
      type: String,
      enum: ["manual", "scheduled", "automation", "ai"],
      default: "scheduled",
    },

    // 📊 ANALYTICS (synced later)
    analytics: {
      //common analytics
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      
      saves: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      // 🔥 Telegram specific
      reactions: { type: Number, default: 0 },
      replies: { type: Number, default: 0 },
      forwards: { type: Number, default: 0 },
    },

    // 🔁 Analytics sync tracking
    lastAnalyticsSyncAt: {
      type: Date,
    },

    analyticsStatus: {
      type: String,
      enum: ["pending", "synced", "failed"],
      default: "pending",
    },

    // 🟢 Post state
    status: {
      type: String,
      enum: ["published", "deleted", "failed"],
      default: "published",
    },

    // 🔍 Debug / audit
    errorMessage: {
      type: String,
    },
  },
  { timestamps: true }
);

// ⚡ Indexes for dashboard speed
PublishedPostSchema.index({ user: 1, platform: 1, pageId: 1 });
PublishedPostSchema.index({ publishedAt: -1 });

export default mongoose.model("PublishedPost", PublishedPostSchema);
