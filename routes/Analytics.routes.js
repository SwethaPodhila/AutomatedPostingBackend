import express from "express";
import { getAnalyticsByPage } from "../controllers/Analytics.controller.js";

const router = express.Router();

// GET analytics for a page (page-level + post-level)
router.get("/page/:pageId", getAnalyticsByPage);

export default router;
