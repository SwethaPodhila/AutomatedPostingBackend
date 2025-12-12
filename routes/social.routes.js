import express from "express";
import * as controller from "../controllers/social.controller.js";
import SocialAccount from "../models/socialAccount.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ dest: "uploads/" }); 

router.post("/publish/facebook", upload.single("image"), controller.publish);
router.get("/facebook", controller.authRedirect);
router.get("/facebook/callback", controller.callback);

// Get pages and metrics
router.get("/pages/:userId", controller.getPages);   // <-- new API
router.get("/metrics/:pageId", controller.metrics);

// GET all connected accounts for user
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;

        const accounts = await SocialAccount.find({ user: userId });

        return res.json({ success: true, accounts });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
});

// DELETE a specific platform (facebook / instagram)
router.delete("/:platform/:userId", async (req, res) => {
    try {
        const { platform, userId } = req.params;

        await SocialAccount.deleteMany({ user: userId, platform });

        return res.json({ success: true, message: `${platform} disconnected` });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false });
    }
});

export default router;