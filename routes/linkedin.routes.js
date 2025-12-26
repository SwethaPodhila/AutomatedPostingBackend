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
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Check if it's LinkedIn or Twitter
    const isLinkedIn = req.originalUrl.includes('linkedin');
    const destination = isLinkedIn ? uploadsDir : twitterUploadsDir;
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "media-" + unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { 
    fileSize: 200 * 1024 * 1024, // ✅ INCREASED: 200MB for all files
    files: 1 // Limit to 1 file
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|mov|avi|webm|mkv|flv|wmv/i;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed: JPEG, PNG, GIF, MP4, MOV, AVI`));
    }
  }
});

 
// LinkedIn OAuth Routes
router.get("/", linkedinAuth);  // /auth/linkedin?userId=...&platform=android
router.get("/callback", linkedinCallback);  // /auth/linkedin/callback
 
// LinkedIn API Routes
router.get("/check", checkLinkedInConnection);  // /auth/linkedin/check?userId=...
router.post("/post", upload.single('media'), postToLinkedIn);  // /auth/linkedin/post
router.post("/disconnect", disconnectLinkedIn);  // /auth/linkedin/disconnect
router.get("/test-connection", testLinkedInConnection);  // /auth/linkedin/test-connection
router.get("/posts", getLinkedInPosts);  // /auth/linkedin/posts?userId=...
router.get("/profile", getLinkedInProfile);  // /auth/linkedin/profile?userId=...
router.get("/verify-session", verifyAndroidSessionLinkedin);  // /auth/linkedin/verify-session?userId=...
router.post("/ai-generate", generateLinkedInCaption);  // /auth/linkedin/ai-generate
router.delete("/post/delete", deleteScheduledLinkedInPost);  // /auth/linkedin/post/delete
 
// Android-specific Routes
router.post("/android", androidLinkedInAuth);  // /auth/linkedin/android (POST for Android app)
router.get("/android/test", testAndroidDeepLink);  // /auth/linkedin/android/test
router.get("/platform-info", getPlatformInfo);  // /auth/linkedin/platform-info
 
export default router;