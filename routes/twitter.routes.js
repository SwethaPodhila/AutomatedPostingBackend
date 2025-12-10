import express from "express";
import * as twitterController from "../controllers/twitter.controller.js";

const router = express.Router();

// ==================== TWITTER ROUTES ====================
router.get("/twitter", twitterController.twitterAuth);
router.get("/twitter/callback", twitterController.twitterCallback);
router.post("/twitter/post", twitterController.postToTwitter);
router.get("/twitter/account/:userId", twitterController.getTwitterAccount);
router.post("/twitter/disconnect", twitterController.disconnectTwitter);

export default router;
