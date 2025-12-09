import express from "express";
import {
  redirectToLogin,
  handleCallback,
  postToInstagram
} from "../controllers/instagram.controller.js";

const router = express.Router();

router.get("/", redirectToLogin);
router.get("/callback", handleCallback);
router.post("/post", postToInstagram);

export default router;
