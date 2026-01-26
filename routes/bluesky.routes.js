const express = require("express");
const router = express.Router();
const { connectBluesky } = require("../controllers/blueskyController");
const authMiddleware = require("../middlewares/auth");

router.post("/connect", authMiddleware, connectBluesky);

module.exports = router;