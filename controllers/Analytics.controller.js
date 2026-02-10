import PageAnalytics from "../models/PageAnalytics.js";
import PublishedPost from "../models/PublishedPost.js";

// ✅ Get analytics for a page (page-level + post-level)
export const getAnalyticsByPage = async (req, res) => {
  try {
    const { pageId } = req.params;

    if (!pageId) {
      return res.status(400).json({ success: false, msg: "Page ID required" });
    }

    // 🔹 Page-level analytics (latest)
    const pageAnalytics = await PageAnalytics.findOne({ providerId: pageId })
      .sort({ date: -1 });

    // 🔹 Post-level analytics for this page
    const posts = await PublishedPost.find({ pageId, status: "published" })
      .select("caption mediaUrl mediaType analytics publishedAt")
      .sort({ publishedAt: -1 });

    return res.json({
      success: true,
      pageAnalytics,
      posts,
    });
  } catch (err) {
    console.error("Analytics fetch error:", err.message);
    return res.status(500).json({ success: false, msg: "Server error" });
  }
};
