import Automation from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";
import TwitterAccount from "../models/TwitterAccount.js";

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

      startDate: new Date(startDate),
      endDate: new Date(endDate),

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
/*
export const getUserAccounts = async (req, res) => {
  console.log("Fetching accounts for user:", req.params);
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ msg: "User ID is required" });

    const accounts = await SocialAccount.find({ user: String(userId) });

    res.json({ data: accounts });
  } catch (err) {
    console.error("Error fetching user accounts:", err);
    res.status(500).json({ msg: "Failed to fetch accounts" });
  }
};
*/

export const getUserAccounts = async (req, res) => {
  try {
    console.log("Fetching all accounts for user:", req.params);
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ msg: "User ID is required" });
    }

    const [socialAccounts, twitterAccounts] = await Promise.all([
      SocialAccount.find({ user: String(userId) }).lean(),
      TwitterAccount.find({ user: String(userId) }).lean()
    ]);

    const accounts = [
      ...socialAccounts.map(a => ({
        ...a,
        platform: a.platform,   // facebook / instagram
        source: "social"
      })),
      ...twitterAccounts.map(a => ({
        ...a,
        platform: "twitter",
        source: "twitter"
      }))
    ];

    res.json({ data: accounts });
  } catch (err) {
    console.error("Error fetching all user accounts:", err);
    res.status(500).json({ msg: "Failed to fetch accounts" });
  }
};
