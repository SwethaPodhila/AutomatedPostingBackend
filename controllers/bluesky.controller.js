const { BskyAgent } = require("@atproto/api");
const SocialAccount = require("../models/socialAccount");

exports.connectBluesky = async (req, res) => {
    try {
        const { handle, appPassword ,userId } = req.body;
       // const userId = req.user.id;

        if (!handle || !appPassword) {
            return res.status(400).json({ message: "Missing credentials" });
        }

        const agent = new BskyAgent({
            service: "https://bsky.social",
        });

        await agent.login({
            identifier: handle,
            password: appPassword,
        });

        const profile = await agent.getProfile({ actor: handle });

        // Remove existing bluesky connection
        await SocialAccount.deleteMany({
            user: userId,
            platform: "bluesky",
        });

        const account = await SocialAccount.create({
            user: userId,
            platform: "bluesky",
            providerId: agent.session.did,
            connectedFrom: "web", 
            accessToken: agent.session.accessJwt,
            refreshToken: agent.session.refreshJwt,
            scopes: ["post", "read", "metrics"],
            meta: {
                handle,
                username: profile.data.displayName,
                avatar: profile.data.avatar,
                service: "https://bsky.social",
                connectedVia: "app-password",
            },
        });

        res.json({
            success: true,
            account,
        });
    } catch (err) {
        console.error(err);
        res.status(401).json({
            message: "Invalid Bluesky handle or app password",
        });
    }
};