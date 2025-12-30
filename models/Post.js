import mongoose from "mongoose";

const PostSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  platform: {
    type: String,
    required: true,
    enum: ["twitter", "linkedin", "youtube"] // ✅ added YouTube
  },

  accessToken: String,
  accessTokenSecret: String, // for Twitter only

  providerId: {
    type: String,
    default: null
  },
  content: {
    type: String,
    default: ""
  },
  mediaType: {
    type: String,
    enum: ["image", "video", "gif", "youtube", null], // ✅ added youtube
    default: null
  },
  mediaUrl: {
    type: String,
    default: null
  },
  cloudinaryPublicId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ["draft", "scheduled", "processing", "posted", "failed"],
    default: "draft"
  },
  scheduledTime: {
    type: Date,
    default: null
  },
  postedAt: {
    type: Date,
    default: null
  },
  postUrl: {
    type: String,
    default: null
  },
  scheduleJobId: {
    type: String,
    default: null
  },
  error: {
    type: String,
    default: null
  },
  linkedinAssetId: {
    type: String,
    default: null
  },
  youtubeVideoId: { // ✅ YouTube specific
    type: String,
    default: null
  },
  youtubeChannelId: { // ✅ YouTube specific
    type: String,
    default: null
  },
  accountInfo: {
    username: String,
    name: String,
    firstName: String,
    lastName: String,
    profileImage: String,
    platformId: String
  }
}, {
  timestamps: true
});

export default mongoose.model("Post", PostSchema);
