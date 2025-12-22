// linkedin.routes.js - UPDATED
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
    getPlatformInfo
} from "../controllers/linkedin.controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
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
 

// Android-specific Routes
router.post("/android", androidLinkedInAuth);  // /auth/linkedin/android (POST for Android app)
router.get("/android/test", testAndroidDeepLink);  // /auth/linkedin/android/test
router.get("/platform-info", getPlatformInfo);  // /auth/linkedin/platform-info

export default router;