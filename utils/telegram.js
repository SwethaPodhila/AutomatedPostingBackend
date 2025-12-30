import TelegramBot from "node-telegram-bot-api";

/**
 * Post message / image / video to Telegram
 * @param {string} botToken - Telegram bot token
 * @param {string|number} chatId - Channel / Group chat ID
 * @param {string} message - Text / caption
 * @param {string|null} mediaUrl - Image / Video URL (Cloudinary / public URL)
 */
export const postToTelegram = async ({
  botToken,
  chatId,
  message,
  mediaUrl = null,
}) => {
  try {
    // ❗ polling MUST be false (cron safe)
    const bot = new TelegramBot(botToken, { polling: false });

    console.log("📨 Telegram Posting →", chatId);

    // 🟢 MEDIA POST
    if (mediaUrl) {
      const lowerUrl = mediaUrl.toLowerCase();

      // 🎥 VIDEO
      if (
        lowerUrl.endsWith(".mp4") ||
        lowerUrl.endsWith(".mov") ||
        lowerUrl.endsWith(".webm")
      ) {
        return await bot.sendVideo(chatId, mediaUrl, {
          caption: message || "",
        });
      }

      // 🖼 IMAGE
      return await bot.sendPhoto(chatId, mediaUrl, {
        caption: message || "",
      });
    }

    // 📝 TEXT ONLY
    return await bot.sendMessage(chatId, message || "");

  } catch (err) {
    console.error("❌ Telegram Post Failed:", err.message);
    throw err;
  }
};
