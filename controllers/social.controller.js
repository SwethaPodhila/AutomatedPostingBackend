import dotenv from "dotenv";
dotenv.config();

import User from "../models/users.js";
import SocialAccount from "../models/socialAccount.js";
import fbApi from "../utils/FbApis.js";

const { FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI, FRONTEND_URL } = process.env;

export const authRedirect = (req, res) => {
  const scopes = [
    "pages_read_engagement",
    "pages_read_user_content",
    "pages_manage_posts",
    "public_profile",
    "email",
    "pages_show_list",
  ];

  const url = fbApi.getAuthUrl({
    clientId: FB_APP_ID,
    redirectUri: FB_REDIRECT_URI,
    scopes,
  });

  return res.redirect(url);
};

// 2) Callback: exchange code -> token, list pages, save tokens
export const callback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');

    const tokenRes = await fbApi.exchangeCodeForToken({ clientId: FB_APP_ID, clientSecret: FB_APP_SECRET, redirectUri: FB_REDIRECT_URI, code });
    // tokenRes: { access_token, token_type, expires_in }
    const accessToken = tokenRes.access_token;

    // OPTIONAL: Exchange short-lived token for long-lived token
    // Facebook long-lived token exchange endpoint: /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=SHORT_LIVED
    // For simplicity, we skip here — you should exchange in prod.

    // Get pages managed by user
    const pages = await fbApi.getUserPages(accessToken);

    // For demo: create or find a demo user (in real app, associate with signed-in user)
    let user = await User.findOne({ email: 'demo@facebook' });
    if (!user) {
      user = await User.create({ email: 'demo@facebook', name: 'FB Demo' });
    }

    // Save one SocialAccount per page
    const savedAccounts = [];
    for (const page of pages.data || []) {
      // page contains id, name, access_token (page access token), perms
      const existing = await SocialAccount.findOne({ providerId: page.id, platform: 'facebook' });
      if (existing) {
        existing.accessToken = page.access_token || accessToken;
        existing.meta = page;
        await existing.save();
        savedAccounts.push(existing);
      } else {
        const acc = await SocialAccount.create({
          user: user._id,
          platform: 'facebook',
          providerId: page.id,
          accessToken: page.access_token || accessToken,
          scopes: page.perms || [],
          meta: page
        });
        savedAccounts.push(acc);
      }
    }

    // Redirect back to frontend with success (you can send data or token etc.)
    return res.redirect(`${FRONTEND_URL}/facebook-connected`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).send('Facebook callback error');
  }
};

// 3) Publish endpoint
export const publish = async (req, res) => {
  try {
    const { pageId, message } = req.body;
    const acc = await SocialAccount.findOne({ providerId: pageId, platform: 'facebook' });
    if (!acc) return res.status(404).json({ msg: 'Page not connected' });


    const pageToken = acc.accessToken;
    const result = await fbApi.publishToPage({ pageAccessToken: pageToken, pageId, message });
    return res.json({ success: true, result });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ success: false, error: 'Publish failed' });
  }
};

// 4) Metrics: simple followers count for a page
export const metrics = async (req, res) => {
  try {
    const { pageId } = req.query;
    const acc = await SocialAccount.findOne({ providerId: pageId, platform: 'facebook' });
    if (!acc) return res.status(404).json({ msg: 'Page not connected' });


    const url = `https://graph.facebook.com/v17.0/${pageId}`;
    const params = { fields: 'name,fan_count,followers_count,engagement', access_token: acc.accessToken };
    const axios = require('axios');
    const response = await axios.get(url, { params });
    return res.json({ success: true, metrics: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};