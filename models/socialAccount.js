const mongoose = require('mongoose');
const SocialAccountSchema = new mongoose.Schema({
    user: { type: String, required: true },
    platform: { type: String, required: true },
    providerId: String, // facebook user id or page id
    accessToken: String,
    refreshToken: String, // FB issues long-lived tokens differently; keep field
    scopes: [String],
    tokenExpiresAt: Date,
    meta: Object,
    createdAt: { type: Date, default: Date.now }
});
SocialAccountSchema.index({ user: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('SocialAccount', SocialAccountSchema);