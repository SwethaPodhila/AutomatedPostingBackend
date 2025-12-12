import mongoose from 'mongoose';

const TwitterAccountSchema = new mongoose.Schema({
  user: { 
    type: String, 
    required: true,
    index: true
  },
  platform: { 
    type: String, 
    required: true,
    default: "twitter",
    index: true
  },
  providerId: {
    type: String,
    index: true
  },
  accessToken: { 
    type: String, 
    required: true 
  },
  refreshToken: { 
    type: String, 
    required: true 
  },
  scopes: [String],
  tokenExpiresAt: Date,
  meta: {
    twitterId: String,
    username: String,
    name: String,
    profileImage: String,
    followersCount: Number,
    followingCount: Number
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  lastUsed: { 
    type: Date, 
    default: Date.now 
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Compound index for unique user-platform combination
TwitterAccountSchema.index({ user: 1, platform: 1 }, { unique: true });

// Index for queries by username
TwitterAccountSchema.index({ 'meta.username': 1 });

// Index for token refresh queries
TwitterAccountSchema.index({ tokenExpiresAt: 1 });

// Pre-save hook to update timestamps
TwitterAccountSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('TwitterAccount', TwitterAccountSchema);