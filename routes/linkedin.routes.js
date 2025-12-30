import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from 'url';
import {
    linkedinAuth,
    linkedinCallback,
    checkLinkedInConnection,
    postToLinkedIn,
    disconnectLinkedIn,
    testLinkedInConnection,
    getLinkedInPosts,
    androidLinkedInAuth,
    testAndroidDeepLink,
    getPlatformInfo,
    getLinkedInProfile,
    verifyAndroidSessionLinkedin,
    generateLinkedInCaption,
    deleteScheduledLinkedInPost
} from "../controllers/linkedin.controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ✅ FIXED: Create upload directories
import fs from 'fs';
const uploadsDir = path.join(__dirname, '..', 'uploads');
const linkedinUploadsDir = path.join(uploadsDir, 'linkedin');
const twitterUploadsDir = path.join(uploadsDir, 'twitter');

// Create directories if they don't exist
[uploadsDir, linkedinUploadsDir, twitterUploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ✅ FIXED: Use correct variables
    const isLinkedIn = req.originalUrl.includes('linkedin');
    const destination = isLinkedIn ? linkedinUploadsDir : twitterUploadsDir;
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "media-" + unique + ext);
  }
});

const upload = multer({
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // ✅ LinkedIn limit: 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // LinkedIn supports only images for posts
    const allowed = /jpeg|jpg|png|gif/i;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. LinkedIn only supports: JPEG, PNG, GIF`));
    }
  }
});

// LinkedIn OAuth Routes
router.get("/", linkedinAuth);  // /api/linkedin?userId=...&platform=android
router.get("/callback", linkedinCallback);  // /api/linkedin/callback

// LinkedIn API Routes
router.get("/check", checkLinkedInConnection);  // /api/linkedin/check?userId=...
router.get("/profile", getLinkedInProfile);  // /api/linkedin/profile?userId=...
router.get("/verify-session", verifyAndroidSessionLinkedin);  // /api/linkedin/verify-session?userId=...
router.get("/posts", getLinkedInPosts);  // /api/linkedin/posts?userId=...
router.get("/test-connection", testLinkedInConnection);  // /api/linkedin/test-connection
router.get("/platform-info", getPlatformInfo);  // /api/linkedin/platform-info

// ✅ FIXED: POST routes
router.post("/ai-generate", generateLinkedInCaption);  // /api/linkedin/ai-generate
router.post("/disconnect", disconnectLinkedIn);  // /api/linkedin/disconnect
router.post("/post", upload.single('media'), postToLinkedIn);  // /api/linkedin/post
router.delete("/post/delete", deleteScheduledLinkedInPost);  // /api/linkedin/post/delete

// Android-specific Routes
router.post("/android", androidLinkedInAuth);  // /api/linkedin/android (POST for Android app)
router.get("/android/test", testAndroidDeepLink);  // /api/linkedin/android/test

export default router;