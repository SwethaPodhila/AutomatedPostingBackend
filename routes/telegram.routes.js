const express = require("express");
const router = express.Router();
const {
    connectTelegram,
    disconnectTelegram,
} = require("../controllers/telegram.controller");

// POST /telegram/connect
router.post("/connect", connectTelegram);

module.exports = router;
