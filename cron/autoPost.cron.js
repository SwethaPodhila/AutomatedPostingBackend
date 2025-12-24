// cron/autoPost.cron.js
import cron from "node-cron";
import Automation from "../models/Automation.js";
import { generateCaption, generateImage } from "../services/ai.service.js";
import { postToFacebook } from "../services/meta.service.js";
import { isSameDay, timeMatches } from "../utils/time.js";

cron.schedule("* * * * *", async () => {
  console.log("⏰ Cron running...");

  const now = new Date();

  const automations = await Automation.find({
    status: "active",
    startDate: { $lte: now },
    endDate: { $gte: now }
  });

  for (let auto of automations) {
    // same day already posted?
    if (isSameDay(auto.lastPostedAt, now)) continue;

    // time check
    if (!timeMatches(auto.time, now)) continue;

    try {
      const day =
        Math.floor((now - auto.startDate) / (1000 * 60 * 60 * 24)) + 1;

      const caption = await generateCaption(auto.prompt, day);
      const imageUrl = await generateImage(auto.prompt);

      for (let pageId of auto.pageIds) {
        // ⚠️ example token — DB nundi teeskovali
        const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

        await postToFacebook(
          pageId,
          PAGE_ACCESS_TOKEN,
          caption,
          imageUrl
        );
      }

      auto.lastPostedAt = now;
      await auto.save();

      console.log("✅ Posted successfully");
    } catch (err) {
      console.error("❌ Auto post failed:", err.message);
    }
  }
});
