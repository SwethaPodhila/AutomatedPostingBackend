import express from "express";
import * as controller from "../controllers/social.controller.js";
import SocialAccount from "../models/socialAccount.js";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const isVideo = file.mimetype.startsWith("video");

        return {
            folder: "automation_posts", // remove any extra slashes
            resource_type: isVideo ? "video" : "image",
            allowed_formats: isVideo
                ? ["mp4", "mov", "webm"]
                : ["jpg", "png", "jpeg", "webp"],
        };
    },
});

const upload = multer({ storage });

router.post(
    "/publish/facebook",
    upload.single("media"), // 🔥 image OR video
    controller.publish
);

router.get("/facebook", controller.authRedirect);
router.get("/facebook/callback", controller.callback);
router.post("/ai-generate", controller.generateAICaption);

// Get pages and metrics
router.get("/pages/:userId", controller.getPages);   // <-- new API
router.get("/metrics/:pageId", controller.metrics);

// DELETE a specific platform (facebook / instagram)
router.post("/:platform/disconnect", controller.disconnectAccount);

router.get("/posts/:userId", controller.getPostedPosts);

// Instagram connect (uses FB login internally)
router.get("/instagram/connect", controller.instagramAuthRedirect);
router.get("/instagram/callback", controller.instagramCallback);

// Instagram publish
router.post(
    "/publish/instagram",
    upload.single("media"), // ✅ image OR video
    controller.publishInstagram
);


// Instagram metrics
router.get("/instagram/metrics/:userId", controller.instagramMetrics);


// GET all connected accounts for user
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const accounts = await SocialAccount.find({ user: userId });

        return res.json({ success: true, accounts });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
});

export default router;
