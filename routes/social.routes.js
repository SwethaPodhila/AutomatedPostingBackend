import express from "express";
import * as controller from "../controllers/social.controller.js";

const router = express.Router();

router.get("/facebook", controller.authRedirect);
router.get("/facebook/callback", controller.callback);

// Get pages and metrics
router.get("/pages/:userId", getPages);

export default router;