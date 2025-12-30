const axios = require("axios");
const querystring = require("querystring");
const SocialAccount = require("../models/socialAccount");

const CLIENT_ID = process.env.PINTEREST_CLIENT_ID;
const CLIENT_SECRET = process.env.PINTEREST_CLIENT_SECRET;
const REDIRECT_URI = process.env.PINTEREST_REDIRECT_URI;

// Pinterest scopes
const SCOPES = "boards:read users:read pins:write";

/**
 * STEP 1️⃣ Redirect user to Pinterest OAuth
 * URL: /pinterest/auth?user=USER_ID
 */
exports.redirectToPinterest = (req, res) => {
    try {
        const { user } = req.query;

        if (!user) {
            return res.send("User ID missing");
        }

        // Store userId safely in state
        const state = JSON.stringify({
            userId: user,
            ts: Date.now(),
        });

        const authUrl =
            "https://www.pinterest.com/oauth/?" +
            querystring.stringify({
                response_type: "code",
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
                scope: SCOPES,
                state,
            });

        console.log("🔴 Pinterest OAuth Redirect");

        res.redirect(authUrl);
    } catch (err) {
        console.error("Pinterest redirect error:", err);
        res.send("Pinterest redirect failed");
    }
};

/**
 * STEP 2️⃣ Pinterest OAuth Callback
 * URL: /pinterest/callback
 */
exports.pinterestCallback = async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.send("Invalid Pinterest callback");
    }

    let userId;

    try {
        const parsedState = JSON.parse(state);
        userId = parsedState.userId;
    } catch (err) {
        return res.send("Invalid state parameter");
    }

    if (!userId) {
        return res.send("User not found");
    }

    try {
        console.log("🟢 Pinterest Callback Triggered");

        // ==============================
        // 🔑 Exchange code for access token
        // ==============================
        const tokenRes = await axios.post(
            "https://api.pinterest.com/v5/oauth/token",
            querystring.stringify({
                grant_type: "authorization_code",
                code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        const {
            access_token,
            refresh_token,
            expires_in,
        } = tokenRes.data;

        // ==============================
        // 👤 Fetch Pinterest user profile
        // ==============================
        const userRes = await axios.get(
            "https://api.pinterest.com/v5/user_account",
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                },
            }
        );

        const userMeta = userRes.data;

        // ==============================
        // 💾 Save / Update MongoDB
        // ==============================
        await SocialAccount.findOneAndUpdate(
            {
                user: userId,
                platform: "pinterest",
            },
            {
                user: userId,
                platform: "pinterest",
                providerId: userMeta.id,
                connectedFrom: "web",
                accessToken: access_token,
                refreshToken: refresh_token,
                scopes: SCOPES.split(" "),
                tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
                meta: userMeta,
                updatedAt: new Date(),
            },
            {
                upsert: true,
                new: true,
            }
        );

        // ==============================
        // ✅ Close popup & notify frontend
        // ==============================
        res.send(`
            <script>
                window.opener && window.opener.postMessage(
                    { type: "PINTEREST_CONNECTED" },
                    "*"
                );
                window.close();
            </script>
        `);
    } catch (err) {
        console.error(
            "❌ Pinterest OAuth Error:",
            err.response?.data || err.message
        );

        res.send(`
            <script>
                alert("Pinterest connection failed");
                window.close();
            </script>
        `);
    }
};