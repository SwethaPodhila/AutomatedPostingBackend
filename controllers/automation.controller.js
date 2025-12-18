import Automation from "../models/Automation.js";
import SocialAccount from "../models/SocialAccount.js";

export const getAccounts = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }

    const accounts = await SocialAccount.find({ userId });

    res.json({ data: accounts });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const triggerAutomation = async (req, res) => {
  try {
    const { userId, prompt, startDateTime, frequency, pageIds } = req.body;

    // 🔴 validation
    if (
      !userId ||
      !prompt ||
      !startDateTime ||
      !frequency ||
      !pageIds ||
      !pageIds.length
    ) {
      return res.status(400).json({
        message: "Missing required fields",
        received: req.body
      });
    }

    // 🔥 verify pages belong to user
    const accounts = await SocialAccount.find({
      userId,
      pageId: { $in: pageIds }
    });

    if (!accounts.length) {
      return res.status(400).json({
        message: "No valid social accounts found"
      });
    }

    await Automation.create({
      userId,
      prompt,
      frequency,
      interval: 1,
      nextRunAt: new Date(startDateTime),
      pageIds
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Automation creation failed" });
  }
};
