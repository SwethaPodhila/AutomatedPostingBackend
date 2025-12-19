import cron from "node-cron";
//import Automation from "./models/Automation.js";
import Automation from "../models/Automation.js";
import { runAutomation } from "../services/runAutomation.js"; // your existing runAutomation logic

// Runs every minute
cron.schedule("* * * * *", async () => {
  console.log("⏰ Cron triggered at", new Date().toLocaleTimeString());
  const now = new Date();

  const automations = await Automation.find({ status: "active", nextRunAt: { $lte: now } });

  for (const auto of automations) {
    await runAutomation(auto); // generates caption + image + posts + saves status
  }
});
