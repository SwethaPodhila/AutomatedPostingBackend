import express from "express";
import * as twitterController from "../controllers/twitter.controller.js";

const router = express.Router();

// ==================== TWITTER ROUTES (UPDATED TO MATCH server.js) ====================

// 🔹 Step 1: Twitter Login
//   Final URL: /auth/twitter?userId=123
router.get("/twitter", twitterController.twitterAuth);

// 🔹 Step 2: Callback after Twitter Login
//   Final URL: /auth/twitter/callback
router.get("/twitter/callback", twitterController.twitterCallback);

// 🔹 Step 3: Check if Twitter is Connected
//   Final URL: /api/twitter/check?userId=123
router.get("/twitter/check", twitterController.checkTwitterConnection);

// 🔹 Step 4: Post Tweet
//   Final URL: /api/twitter/post
router.post("/twitter/post", twitterController.postToTwitter);

// 🔹 Step 5: Get Saved Account Details
//   Final URL: /api/twitter/account/:userId
router.get("/twitter/account/:userId", twitterController.getTwitterAccount);

// 🔹 Step 6: Disconnect Twitter
//   Final URL: /api/twitter/disconnect
router.delete("/twitter/disconnect", twitterController.disconnectTwitter);

export default router;
