import express from "express";
import {
  twitterAuth,
  twitterCallback,
  checkTwitterConnection,
  publishTweet,
  disconnectTwitter,
  verifyAndroidSession,
  getTwitterProfile,
  generateTwitterCaption,
  getTwitterPosts,
  deleteScheduledTweet
} from "../controllers/twitter.controller.js";

const router = express.Router();

// Auth
router.get("/auth", twitterAuth);
router.get("/auth/callback", twitterCallback);

// Check connection
router.get("/check", checkTwitterConnection);

// Publish tweet (NO MEDIA)
router.post("/publish", publishTweet);

// AI caption
router.post("/ai-generate", generateTwitterCaption);

// Get posts
router.get("/posts", getTwitterPosts);

// Delete scheduled tweet
router.delete("/post/delete", deleteScheduledTweet);

// Get profile
router.get("/profile", getTwitterProfile);

// Disconnect
router.post("/disconnect", disconnectTwitter);

// Verify Android session
router.get("/verify-session", verifyAndroidSession);

export default router;