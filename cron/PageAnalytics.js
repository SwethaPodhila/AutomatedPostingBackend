const cron = require("node-cron");
const axios = require("axios");
const SocialAccount = require("../models/socialAccount.js");
const PageAnalytics = require("../models/PageAnalytics.js");

cron.schedule("*/3 * * * *", async () => {
    console.log(" Page analytics cron started");

    const pages = await SocialAccount.find({
        platform: "facebook",
    });

    for (let page of pages) {
        try {
            const today = new Date().toISOString().split("T")[0];

            const url = `https://graph.facebook.com/v18.0/${page.providerId}/insights`;
            const metrics = [
                "page_fans",
                "page_impressions",
                "page_impressions_unique",
                "page_engaged_users",
            ].join(",");

            const response = await axios.get(url, {
                params: {
                    metric: metrics,
                    access_token: page.accessToken,
                },
            });

            const data = response.data.data;

            const analytics = {
                socialAccount: page._id,
                providerId: page.providerId,
                platform: "facebook",
                followers: data[0]?.values[0]?.value || 0,
                impressions: data[1]?.values[0]?.value || 0,
                reach: data[2]?.values[0]?.value || 0,
                engagement: data[3]?.values[0]?.value || 0,
                date: today,
            };

            await PageAnalytics.updateOne(
                { socialAccount: page._id, date: today },
                { $set: analytics },
                { upsert: true }
            );

            console.log(`✅ Saved analytics for page ${page.providerId}`);
        } catch (err) {
            console.error("❌ Analytics error:", err.message);
        }
    }
});