import express from "express";
import { createAutomation, getUserAccounts, universalPublish } from "../controllers/automation.controller.js";

const router = express.Router();

import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import multer from "multer";

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

router.get("/accounts/:userId", getUserAccounts);
router.post(
    "/publish",
    upload.single("media"), // works even if no media
    universalPublish
);

router.post(
    "/auto-publish",
    createAutomation
);

export default router;