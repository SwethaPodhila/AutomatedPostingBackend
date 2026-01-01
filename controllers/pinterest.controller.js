const axios = require("axios");
const querystring = require("querystring");
const SocialAccount = require("../models/socialAccount");

const CLIENT_ID = process.env.PINTEREST_CLIENT_ID;
const CLIENT_SECRET = process.env.PINTEREST_CLIENT_SECRET;
const REDIRECT_URI = process.env.PINTEREST_REDIRECT_URI;
const PINTEREST_MODE = process.env.PINTEREST_MODE || "production";

// Scopes required
const SCOPES =
  "boards:read boards:write pins:read pins:write user_accounts:read";

// Base API URL
const PINTEREST_API_BASE =
  PINTEREST_MODE === "sandbox"
    ? "https://api-sandbox.pinterest.com"
    : "https://api.pinterest.com";

// ==================================================
// STEP 1️⃣ Redirect user to Pinterest OAuth
// URL: /pinterest/auth?user=USER_ID
// ==================================================
exports.redirectToPinterest = (req, res) => {
  try {
    const { user } = req.query;
    if (!user) return res.send("User ID missing");

    // Encode state
    const statePayload = { userId: user, mode: PINTEREST_MODE, ts: Date.now() };
    const state = Buffer.from(JSON.stringify(statePayload)).toString("base64");

    const authUrl =
      "https://www.pinterest.com/oauth/?" +
      querystring.stringify({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        state,
      });

    console.log("➡️ Pinterest OAuth URL:", authUrl);
    res.redirect(authUrl);
  } catch (err) {
    console.error("Pinterest redirect error:", err);
    res.send("Pinterest redirect failed");
  }
};
// ==================================================
// STEP 2️⃣ Pinterest OAuth Callback
// URL: /pinterest/callback
// ==================================================
exports.pinterestCallback = async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.send("Invalid Pinterest callback");

  let parsedState;
  try {
    parsedState = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
  } catch {
    return res.send("Invalid state");
  }

  const { userId } = parsedState;
  if (!userId) return res.send("User not found");

  try {
    // Exchange code for access token
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    const tokenRes = await axios.post(
      `${PINTEREST_API_BASE}/v5/oauth/token`,
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Fetch Pinterest profile
    const userRes = await axios.get(`${PINTEREST_API_BASE}/v5/user_account`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userMeta = userRes.data;

    // Fetch all boards
    let boardsRes = await axios.get(`${PINTEREST_API_BASE}/v5/boards`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    let boards = boardsRes.data.items || [];
    console.log(`✅ Fetched ${boards.length} boards`);

    // Sandbox: auto-create test board if none exist
    if (boards.length === 0 && PINTEREST_MODE === "sandbox") {
      console.log("⚡ No boards in sandbox, creating test board...");
      const createRes = await axios.post(
        `${PINTEREST_API_BASE}/v5/boards`,
        {
          name: `Sandbox Test Board ${Date.now()}`,
          description: "Board created for sandbox testing",
          privacy: "PUBLIC",
        },
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      boards.push(createRes.data);
      console.log("✅ Sandbox test board created:", createRes.data.id);
    }

    // Save each board as separate document, with boardId as providerId
    for (let board of boards) {
      await SocialAccount.findOneAndUpdate(
        { user: userId, platform: "pinterest", providerId: board.id }, // providerId = board.id
        {
          user: userId,
          platform: "pinterest",
          providerId: board.id,           // ✅ board.id as providerId
          connectedFrom: "web",
          accessToken: access_token,
          refreshToken: refresh_token,
          scopes: SCOPES.split(" "),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          meta: {
            boardName: board.name,        // board name in meta
            profile: userMeta             // profile in meta
          },
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
      console.log(`💾 Board saved: ${board.name} (${board.id})`);
    }

    console.log(`✅ All boards saved individually (${boards.length})`);

    res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: "PINTEREST_CONNECTED" }, "*");
        }
        window.close();
      </script>
    `);

  } catch (err) {
    console.error("Pinterest OAuth Error:", err.response?.data || err.message);
    res.send(`
      <script>
        alert("Pinterest connection failed");
        window.close();
      </script>
    `);
  }
};