import mongoose from 'mongoose';

const TwitterAccountSchema = new mongoose.Schema({
  user: { type: String, required: true },
  platform: { 
    type: String, 
    default: "twitter", 
    enum: ["twitter", "linkedin", "youtube"] // support multiple platforms
  },
  
  // 🔥 For Android/iOS support
  loginPlatform: {
    type: String,
    default: "web",
    enum: ["web", "android", "ios"]
  },
  androidSessionId: {
    type: String,
    default: null
  },
  
  // OAuth fields
  oauthState: { type: String, sparse: true },
  oauthCodeVerifier: String,
  oauthCreatedAt: Date,

  providerId: String,
  accessToken: String,
  refreshToken: String,
  scopes: [String],
  tokenExpiresAt: Date,
  
  meta: {
    // Twitter
    twitterId: String,
    username: String,
    name: String,
    profileImage: String,

    // LinkedIn
    linkedinId: String,
    linkedinName: String,
    linkedinProfileUrl: String,

    // YouTube
    youtubeChannelId: String,
    youtubeChannelTitle: String,
    youtubeProfileImage: String
  }
}, {
  timestamps: true
});

export default mongoose.model('TwitterAccount', TwitterAccountSchema);