import Automation from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";

export const triggerAutomation = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const {
      userId,
      prompt,
      startDate,
      endDate,
      time,
      pageIds
    } = req.body;

    // 🔴 Validation
    if (
      !userId ||
      !prompt ||
      !startDate ||
      !endDate ||
      !time ||
      !pageIds?.length
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // 🔴 Verify social accounts belong to user
    const accounts = await SocialAccount.find({
      _id: { $in: pageIds },
      user: userId
    });

    if (!accounts.length) {
      return res.status(400).json({
        message: "Invalid social accounts"
      });
    }

    // 🔥 Create first run datetime
    const nextRunAt = new Date(`${startDate}T${time}:00`);

    await Automation.create({
      userId,
      prompt,
      startDate,
      endDate,
      time,
      pageIds,
      nextRunAt,
      status: "active"
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Automation creation failed" });
  }
};

export const getAccounts = async (req, res) => {
  try {
    const { userId } = req.query; // frontend should send userId as query param
    if (!userId) return res.status(400).json({ msg: "User ID is required" });

    // Fetch accounts where user matches userId
    const accounts = await SocialAccount.find({ user: String(userId) });

    res.json({ data: accounts });
  } catch (err) {
    console.error("Error fetching user accounts:", err);
    res.status(500).json({ msg: "Failed to fetch accounts" });
  }
};
