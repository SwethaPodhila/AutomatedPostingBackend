import Post from "../models/AutomationPosts.js";
import Automation from "../models/Automation.js";

// This is your main automation logic
export const runAutomation = async (auto) => {
  try {
    const caption = await generateCaption(auto.prompt);
    const imageUrl = await generateImage(auto.prompt);

    for (const pageId of auto.pageIds) {
      try {
        await postToSocial(pageId, caption, imageUrl);
        
        await Post.create({
          userId: auto.userId,
          automationId: auto._id,
          pageId,
          caption,
          imageUrl,
          status: "success"
        });
      } catch (err) {
        await Post.create({
          userId: auto.userId,
          automationId: auto._id,
          pageId,
          caption,
          imageUrl,
          status: "failed",
          error: err.message
        });
      }
    }

    const nextRun = new Date(auto.nextRunAt);
    nextRun.setDate(nextRun.getDate() + 1);

    const endDateTime = new Date(`${auto.endDate}T23:59:59`);

    if (nextRun > endDateTime) {
      auto.status = "completed";
    } else {
      auto.nextRunAt = nextRun;
    }

    await auto.save();
  } catch (err) {
    console.error("Automation run failed:", err);
  }
};

// Placeholders
const generateCaption = async (prompt) => `AI Caption: ${prompt} (${new Date().toDateString()})`;
const generateImage = async (prompt) => `https://dummyimage.com/600x400/000/fff&text=${encodeURIComponent(prompt.substring(0,20))}`;
const postToSocial = async (pageId, caption, imageUrl) => console.log("Posted to:", pageId);
