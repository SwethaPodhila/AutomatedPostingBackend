import express from "express";
import { facebookCallback, instagramCallback } from "../controllers/social.controller.js";
import { verifyToken } from "../middlewares/auth.js";

const router = express.Router();

// Facebook & Instagram callbacks protected with JWT
router.get("/facebook/callback", verifyToken, facebookCallback);
router.get("/instagram/callback", verifyToken, instagramCallback);

export default router;
