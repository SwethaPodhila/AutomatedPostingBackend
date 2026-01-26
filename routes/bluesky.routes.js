const express = require("express");
const router = express.Router();
const { connectBluesky } = require("../controllers/bluesky.controller");

router.post("/connect", connectBluesky);

module.exports = router;