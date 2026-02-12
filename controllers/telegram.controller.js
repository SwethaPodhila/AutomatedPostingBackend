import fetch from "node-fetch"
import SocialAccount from "../models/socialAccount.js";
import PublishedPost from "../models/PublishedPost.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USER_ID = Number(process.env.BOT_USER_ID); // ✅ cast to Number once

// Connect Telegram (Admin check + Save to DB)
export const connectTelegram = async (req, res) => {
    const { userId, chatName } = req.body;

    console.log("➡️ Step 0: Request received");
    console.log("User ID:", userId);
    console.log("Chat Name (raw):", chatName);

    if (!userId || !chatName) {
        console.log("❌ Missing userId or chatName");
        return res.status(400).json({ error: "Missing userId or chatName" });
    }

    // Normalize chat name
    let finalChatName = chatName.trim();
    if (!finalChatName.startsWith("@") && !finalChatName.startsWith("-100")) {
        finalChatName = "@" + finalChatName;
    }

    console.log("➡️ Step 1: Normalized chatName:", finalChatName);
    console.log("➡️ Bot Numeric ID:", BOT_USER_ID);

    try {
        // 1️⃣ Get all admins of channel/group
        const adminsUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatAdministrators?chat_id=${finalChatName}`;
        console.log("➡️ Step 2: Calling Telegram API - getChatAdministrators");

        const adminsResponse = await fetch(adminsUrl);
        const adminsData = await adminsResponse.json();
        console.log("⬅️ Step 3: Telegram API Response:", JSON.stringify(adminsData, null, 2));

        if (!adminsData.ok) {
            console.log("❌ Invalid channel/group OR bot not added");
            return res.status(400).json({
                error: "Invalid channel/group or bot not added",
                telegramError: adminsData.description,
            });
        }

        // 2️⃣ Check if bot is admin
        console.log("➡️ Step 4: Checking if bot is admin");

        const isBotAdmin = adminsData.result.some(admin => {
            console.log("Checking admin:", admin.user.id, admin.user.username);
            return Number(admin.user.id) === BOT_USER_ID; // ✅ strict numeric comparison
        });

        if (!isBotAdmin) {
            console.log("❌ Bot is NOT admin");
            return res.status(400).json({
                error: "Bot is not admin in this channel/group",
            });
        }

        console.log("✅ Step 5: Bot IS admin");

        // 3️⃣ Get chat numeric ID (best practice)
        const chatInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${finalChatName}`;
        const chatInfoRes = await fetch(chatInfoUrl);
        const chatInfoData = await chatInfoRes.json();

        if (!chatInfoData.ok) {
            console.log("❌ Failed to get chat info");
            return res.status(400).json({
                error: "Failed to get chat info",
                telegramError: chatInfoData.description,
            });
        }

        const chatId = chatInfoData.result.id; // numeric chat ID
        const chatUsername = chatInfoData.result.username
            ? `@${chatInfoData.result.username}`
            : null;

        console.log("➡️ Step 6: Chat ID & Username fetched", chatId, chatUsername);

        // 4️⃣ Save to MongoDB
        const socialAccount = await SocialAccount.findOneAndUpdate(
            {
                user: userId,
                platform: "telegram",
                providerId: chatId, // numeric ID
            },
            {
                user: userId,
                platform: "telegram",
                providerId: chatId,
                // ✅ IMPORTANT FIX
                accessToken: TELEGRAM_BOT_TOKEN,
                connectedFrom: "web",
                meta: {
                    username: chatUsername,
                    isAdmin: true,
                    verifiedAt: new Date(),
                },
                updatedAt: new Date(),
            },
            { upsert: true, new: true }
        );

        console.log("✅ Step 7: Saved to DB");
        console.log("DB Record:", socialAccount);

        return res.json({
            success: true,
            message: "Telegram connected & saved successfully",
            data: socialAccount,
        });

    } catch (err) {
        console.error("🔥 Server error:", err);
        return res.status(500).json({ error: "Server error" });
    }
};

export const handleTelegramWebhook = async (req, res) => {
  const update = req.body;

  try {
    console.log("📩 Telegram Webhook Hit");
    console.log("FULL UPDATE:", JSON.stringify(update, null, 2));

    // 🔹 Detect message source
    const msg =
      update.message ||
      update.channel_post ||
      update.edited_channel_post;

    // 💬 Reply Tracking
    if (msg?.reply_to_message) {
      const messageId = msg.reply_to_message.message_id.toString();

      const result = await PublishedPost.updateOne(
        { postId: messageId, platform: "telegram" },
        { $inc: { "analytics.replies": 1 } }
      );

      console.log("💬 Reply tracked:", messageId, result);
    }

    // ❤️ Reaction Tracking
    if (update.message_reaction) {
      const messageId =
        update.message_reaction.message_id.toString();

      const result = await PublishedPost.updateOne(
        { postId: messageId, platform: "telegram" },
        { $inc: { "analytics.reactions": 1 } }
      );

      console.log("❤️ Reaction tracked:", messageId, result);
    }

    // 🔁 Forward Tracking
    if (msg?.forward_from || msg?.forward_from_chat) {
      const messageId = msg.message_id.toString();

      const result = await PublishedPost.updateOne(
        { postId: messageId, platform: "telegram" },
        { $inc: { "analytics.forwards": 1 } }
      );

      console.log("🔁 Forward tracked:", messageId, result);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram webhook error:", err.message);
    return res.sendStatus(500);
  }
};
