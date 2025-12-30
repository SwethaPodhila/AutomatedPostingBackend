const express = require("express");
const router = express.Router();
const pinterestController = require("../controllers/pinterest.controller");

// Step 1: Redirect to Pinterest login
router.get("/auth",  pinterestController.redirectToPinterest);

// Step 2: Pinterest callback
router.get("/callback",  pinterestController.pinterestCallback);

module.exports = router;
