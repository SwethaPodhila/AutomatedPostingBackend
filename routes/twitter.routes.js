import express from "express";
import {
  twitterAuth,
  twitterCallback,
  checkTwitterConnection,
  postToTwitter,
  disconnectTwitter,
  verifyAndroidSession,
  getTwitterProfile,
  getTwitterAccount
} from "../controllers/twitter.controller.js";
 
const router = express.Router();
 
// ==================== TWITTER ROUTES ====================
 
// 🔹 Check Connection
router.get("/check", checkTwitterConnection);
 
// 🔹 Post Tweet
router.post("/post", postToTwitter);
 
// 🔹 Get Profile (QUERY PARAM)
router.get("/profile", getTwitterProfile);
 
// 🔹 Get Account (URL PARAM)
router.get("/account/:userId", getTwitterAccount);
 
// 🔹 Disconnect Twitter (POST method)
router.post("/disconnect", disconnectTwitter);
 
// 🔹 Verify Android Session
router.get("/verify-session", verifyAndroidSession);
 
export default router;
