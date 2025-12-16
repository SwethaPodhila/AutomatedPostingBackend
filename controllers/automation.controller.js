import axios from "axios";
import AutomationPost from "../models/Automation.js";
import SocialAccount from "../models/socialAccount.js";

export const triggerMakeAutomation = async (req, res) => {
    try {
        const {
            prompt,
            startTime,
            frequency,          // "weekly" | "monthly"
            selectedAccounts,    // array of SocialAccount IDs
            userId
        } = req.body;

        if (!prompt || !startTime || !frequency || !selectedAccounts?.length) {
            return res.status(400).json({ msg: "Missing required fields" });
        }

        //const userId = req.user?.id || "test-user";

        // 🔁 calculate next trigger time
        const startDate = new Date(startTime);
        let nextTriggerAt = new Date(startDate);

        if (frequency === "weekly") {
            nextTriggerAt.setDate(startDate.getDate() + 7);
        } else if (frequency === "monthly") {
            nextTriggerAt.setMonth(startDate.getMonth() + 1);
        }

        // 💾 SAVE TO DB
        const automationPost = await AutomationPost.create({
            user: userId,
            content: prompt,
            frequency,
            startDate,
            socialAccounts: selectedAccounts,
            lastTriggeredAt: startDate,
            nextTriggerAt,
            status: "active"
        });

        // 🔥 TRIGGER MAKE.COM
        const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

        await axios.post(MAKE_WEBHOOK_URL, {
            automationId: automationPost._id,
            prompt,
            frequency,
            startTime,
            socialAccountIds: selectedAccounts,
            userId
        });

        return res.json({
            success: true,
            msg: "Automation created & triggered successfully",
            data: automationPost
        });

    } catch (err) {
        console.error("MAKE TRIGGER ERROR:", err);
        return res.status(500).json({ success: false, msg: "Server error" });
    }
};

export const getUserAccounts = async (req, res) => {
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

