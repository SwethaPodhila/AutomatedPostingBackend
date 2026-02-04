import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import userRoutes from "./routes/user.routes.js";
import socialRoutes from "./routes/social.routes.js";
import * as facebookController from "./controllers/social.controller.js";
import mongoose from "mongoose";
import session from "express-session";
import MongoStore from "connect-mongo";
import twitterRoutes from "./routes/twitter.routes.js";
import linkedinRoutes from "./routes/linkedin.routes.js";
import automationRoutes from "./routes/automation.routes.js";
import youtubeRoutes from './routes/youtube.routes.js';
import pinterestRoutes from "./routes/pinterest.routes.js";
import TelegramRoutes from "./routes/telegram.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import BlueskyRoutes from "./routes/bluesky.routes.js";

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";

//import "./cron/automation.cron.js";
// server.js
import "./cron/manualDailyCron.js";
import "./cron/analyticsCron.js";


import {
  twitterAuth,
  twitterCallback,
  checkTwitterConnection,
  publishTweet,
  disconnectTwitter,
  verifyAndroidSession,
  getTwitterProfile,
  generateTwitterCaption,
  getTwitterPosts,
  deleteScheduledTweet
} from "./controllers/twitter.controller.js";

import {
  linkedinAuth,
  linkedinCallback,
  checkLinkedInConnection,
  postToLinkedIn,
  disconnectLinkedIn,
  verifyAndroidSessionLinkedin,
  getLinkedInProfile,
  getLinkedInPosts
} from "./controllers/linkedin.controller.js";

import {
  connectYouTube,
  youtubeCallback,
  uploadYouTubeVideo,
  checkYouTubeConnection,
  disconnectYouTube
} from "./controllers/youtube.controller.js";

// =========================
// ✅ ADD THIS LINE HERE (IMAGE UPLOADER IMPORT)
// =========================
import cloudinary, { uploadImageToCloud } from "./config/cloudinary.js"; // ✅ Import from single file // 👈 ADD HERE

dotenv.config();
connectDB();

const app = express();

app.set('trust proxy', 1);

// ✅ CORS setup for multiple origins
const allowedOrigins = [
  "http://localhost:3000", // your local frontend
  "https://www.aiwingsglobal.com",
  "https://aiwingsglobal.com" // deployed frontend
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin like Postman
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use("/api/twitter", twitterRoutes);
app.use("/user", userRoutes);
app.use("/social", socialRoutes);
app.use("/automation", automationRoutes);
app.use("/pinterest", pinterestRoutes)
app.use("/telegram", TelegramRoutes)
app.use("/bluesky", BlueskyRoutes);

// ONLY webhook route uses raw body
app.use(
  "/payment/webhook",
  bodyParser.raw({ type: "application/json" })
);

app.use("/payment", paymentRoutes);

// =========================
// PATH SETUP
// =========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// MIDDLEWARE
// =========================
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded


// =========================
// UPLOAD DIRECTORIES
// =========================
const uploadsDir = path.join(__dirname, "uploads");
const twitterUploadsDir = path.join(uploadsDir, "twitter");

if (!fs.existsSync(twitterUploadsDir)) {
  fs.mkdirSync(twitterUploadsDir, { recursive: true });
  console.log("📁 Upload directories created");
}

// =========================
// MULTER CONFIG
// =========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, twitterUploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "media-" + unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only images & videos allowed"));
  }
});

// =========================
// SESSION CONFIG
// =========================
app.use(
  session({
    name: "social_session",
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/socialmedia",
      collectionName: "sessions"
    }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    }
  })
);

// publish & metrics
//app.post('/publish/facebook', facebookController.publish);

//app.listen(process.env.PORT, () => {
//  console.log(`Server running on port ${process.env.PORT} 🚀`);
//});

// Twitter routes
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/twitterdb")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Mongo Error:", err));


// =========================
//  🔐 SESSION STORE (PRODUCTION FIX)
// =========================
const store = MongoStore.create({
  mongoUrl: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/twitterdb",
  collectionName: "twitter_sessions",
  ttl: 0,
  autoRemove: "disabled"
});

store.on('error', function (error) {
  console.error('❌ Session Store Error:', error);
});

app.use(
  session({
    name: "twitter_session",
    secret: process.env.SESSION_SECRET || "super-secret-key-change-this",
    resave: true, // 🚨 true for production
    saveUninitialized: true, // 🚨 true for production
    store: store,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 365 * 10,
      httpOnly: true,
      secure: true, // 🚨 ALWAYS true for HTTPS
      sameSite: "none"
    }
  })
);

// =========================
// DIRECT TWITTER ROUTES
// =========================
app.post("/api/twitter/ai-generate", generateTwitterCaption);
app.post("/api/twitter/publish", upload.single("media"), publishTweet);
app.get("/auth/twitter", twitterAuth);
app.get("/auth/twitter/callback", twitterCallback);
app.get("/api/twitter/check", checkTwitterConnection);
app.post("/api/twitter/post", upload.single("media"), publishTweet);
app.post("/api/twitter/disconnect", disconnectTwitter);
app.get("/api/twitter/verify-session", verifyAndroidSession);
app.get("/api/twitter/profile", getTwitterProfile);
app.get("/api/twitter/posts", getTwitterPosts);
app.delete("/api/twitter/post/delete", deleteScheduledTweet);

// =========================
// LINKEDIN ROUTES
// =========================
app.get("/auth/linkedin", linkedinAuth);
app.get("/auth/linkedin/callback", linkedinCallback);
app.get("/api/linkedin/check", checkLinkedInConnection);
app.post("/api/linkedin/post", upload.single("media"), postToLinkedIn);
app.post("/api/linkedin/disconnect", disconnectLinkedIn);
app.get("/api/linkedin/posts", getLinkedInPosts);
app.get("/api/linkedin/verify-session", verifyAndroidSessionLinkedin);
app.get("/api/linkedin/profile", getLinkedInProfile);


// YOUTUBE ROUTES ✅ ADD THIS FULL BLOCK
// =========================
// OAuth connect & callback
app.get("/auth/youtube", connectYouTube);
app.get("/auth/youtube/callback", youtubeCallback);
app.get("/auth/google/callback", youtubeCallback); // optional, alias

// Check connection
app.get("/api/youtube/check", checkYouTubeConnection);

// Upload video
app.post("/api/youtube/upload", upload.single("media"), uploadYouTubeVideo);

// Disconnect account
app.post("/api/youtube/disconnect", disconnectYouTube);



// =========================
//  📌 HEALTH
// =========================
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// =========================
//  📌 DEBUG ENDPOINTS
// =========================
app.get("/debug/session", (req, res) => {
  res.json({
    sessionId: req.sessionID,
    hasTwitterOAuth: !!req.session.twitterOAuth,
    hasLinkedInOAuth: !!req.session.linkedinOAuth,
    twitterOAuth: req.session.twitterOAuth,
    linkedinOAuth: req.session.linkedinOAuth,
    cookies: req.cookies
  });
});

// Debug: Check database fields
app.get('/debug/twitter/:userId', async (req, res) => {
  try {
    const account = await TwitterAccount.findOne({
      user: req.params.userId,
      platform: "twitter"
    });

    if (!account) {
      return res.json({ error: "Account not found" });
    }

    res.json({
      success: true,
      loginPlatform: account.loginPlatform,
      androidSessionId: account.androidSessionId,
      hasLoginPlatform: 'loginPlatform' in account._doc,
      hasAndroidSessionId: 'androidSessionId' in account._doc,
      allFields: Object.keys(account._doc)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: Force set platform to android
app.get('/force-android/:userId', async (req, res) => {
  try {
    await TwitterAccount.findOneAndUpdate(
      { user: req.params.userId, platform: "twitter" },
      {
        loginPlatform: "android",
        androidSessionId: null
      }
    );
    res.json({ success: true, message: "Forced to android" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// =========================
//  🚀 START SERVER
// =========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Secure cookies: true`);
  console.log(`🔄 Trust proxy: enabled`);
});
