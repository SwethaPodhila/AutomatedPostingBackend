import cron from "node-cron";
import PostedPost from "../models/manualPosts.js";
import SocialAccount from "../models/socialAccount.js";
import { publishToPage } from "../utils/FbApis.js";
import { publishInstagramUtil } from "../utils/instagramApi.js";

cron.schedule("* * * * *", async () => {
    const posts = await PostedPost.find({
        status: "scheduled",
        scheduledTime: { $lte: new Date() }
    });

    for (const post of posts) {
        try {
            const acc = await SocialAccount.findOne({
                providerId: post.pageId,
                platform: post.platform,
            });

            if (!acc) continue;

            if (post.platform === "facebook") {
                const res = await publishToPage({
                    pageAccessToken: acc.accessToken,
                    pageId: post.pageId,
                    message: post.message,
                    mediaUrl: post.mediaUrl,
                    mediaType: post.mediaType,
                });

                post.postId = res?.id;
            }

            if (post.platform === "instagram") {
                const res = await publishInstagramUtil({
                    igUserId: acc.providerId,
                    accessToken: acc.accessToken,
                    mediaUrl: post.mediaUrl,
                    mediaType: post.mediaType,
                    caption: post.message,
                });

                post.postId = res.postId;
            }

            post.status = "posted";
            await post.save();

        } catch (e) {
            post.status = "failed";
            await post.save();
        }
    }
});
