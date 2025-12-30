import express from "express";
import multer from "multer";
import {
  connectYouTube,
  youtubeCallback,
  checkYouTubeConnection,
  disconnectYouTube,
  getYouTubeVideos,
  uploadYouTubeVideo,
  uploadImages,
  generateYouTubeContent
} from "../controllers/youtube.controller.js"; 
const router = express.Router();

// Create uploads directory if it doesn't exist
import fs from "fs";
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 500 * 1024 * 1024, // 500MB for videos
    files: 10 // Max 10 files
  },
  fileFilter: function (req, file, cb) {
    // Accept videos and images
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video and image files are allowed'), false);
    }
  }
});

// Routes
router.get("/connect", connectYouTube);
router.get("/callback", youtubeCallback);
router.get("/check", checkYouTubeConnection);
router.get("/videos", getYouTubeVideos);
router.post("/disconnect", disconnectYouTube);
router.post("/ai-generate", generateYouTubeContent);

// Video upload (single file)
router.post("/upload", upload.single("file"), uploadYouTubeVideo);

// Images upload (multiple files)
router.post("/upload-images", upload.array("files", 10), uploadImages);

export default router;