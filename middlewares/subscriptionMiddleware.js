import User from "../models/userId.js";

export const subscriptionMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Expiry Check
    if (user.planExpires && new Date() > user.planExpires) {
      console.log("⏳ Plan expired → Downgrading");

      user.plan = "FREE";
      user.subscriptionStatus = "INACTIVE";
      user.planExpires = null;

      await user.save();
    }

    req.subscriptionUser = user;
    next();
  } catch (err) {
    console.error("Subscription middleware error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error in subscription middleware",
    });
  }
};