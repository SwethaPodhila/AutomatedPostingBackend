import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import dotenv from "dotenv";

dotenv.config();

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

const client = new TelegramClient(
  new StringSession(""),
  apiId,
  apiHash,
  { connectionRetries: 5 }
);

(async () => {
  await client.start({
    phoneNumber: async () => await input.text("Phone: "),
    password: async () => await input.text("Password (if any): "),
    phoneCode: async () => await input.text("OTP: "),
  });

  console.log("✅ Login successful");
  console.log("SESSION STRING:");
  console.log(client.session.save());

  process.exit();
})();
