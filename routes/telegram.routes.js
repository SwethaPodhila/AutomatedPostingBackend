const express = require("express");
const router = express.Router();
const {
    connectTelegram,
    disconnectTelegram,
    handleTelegramWebhook,
} = require("../controllers/telegram.controller");

// POST /telegram/connect
router.post("/connect", connectTelegram);
router.post("/webhook", handleTelegramWebhook);

module.exports = router;
