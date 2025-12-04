import dotenv from "dotenv";
dotenv.config();

import User from "../models/users.js";
import SocialAccount from "../models/socialAccount.js";
import fbApi from "../utils/FbApis.js";
import mongoose from "mongoose";

const { FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI, FRONTEND_URL } = process.env;

export const authRedirect = (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send("Missing userId");

  const scopes = [
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_show_list",
    "public_profile",
    "email"
  ];

  const url =
    `https://www.facebook.com/v20.0/dialog/oauth` +
    `?client_id=${FB_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FB_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(userId)}` +
    `&scope=${scopes.join(",")}`;

  return res.redirect(url);
};

// 2) Callback: exchange code -> token, list pages, save tokens
export const callback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = decodeURIComponent(state);

    if (!code) return res.status(400).send("Missing code");
    if (!userId) return res.status(400).send("Missing userId");

    // Convert userId to ObjectId
    let userObjectId; 
    try {
      userObjectId = mongoose.Types.ObjectId(userId);
    } catch (e) {
      console.error("Invalid userId:", userId);
      return res.status(400).send("Invalid userId");
    }

    // Exchange code for access token
    const tokenRes = await fbApi.exchangeCodeForToken({
      clientId: FB_APP_ID,
      clientSecret: FB_APP_SECRET,
      redirectUri: FB_REDIRECT_URI,
      code,
    });

    const accessToken = tokenRes.access_token;
    if (!accessToken) return res.status(500).send("Failed to get access token");

    // Get user's Facebook pages
    const pages = await fbApi.getUserPages(accessToken);
    if (!pages.data || pages.data.length === 0) {
      console.log("No Facebook pages found for user:", userId);
    }

    // Save each page in SocialAccount
    for (const page of pages.data || []) {
      console.log("Saving page:", page.id, "for user:", userId);

      const saved = await SocialAccount.findOneAndUpdate(
        { providerId: page.id, platform: "facebook" },
        {
          user: userObjectId,
          platform: "facebook",
          providerId: page.id,
          accessToken: page.access_token || accessToken,
          scopes: page.perms || [],
          meta: page
        },
        { upsert: true, new: true }
      );
      console.log("Saved page:", saved);
    }

    return res.redirect(`${FRONTEND_URL}/success`);
  } catch (err) {
    console.error("Callback Error ==>", err.response?.data || err.message);
    return res.status(500).send("Facebook callback error");
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

    // const url = `https://graph.facebook.com/v17.0/${pageId}`;
    const url = `https://graph.facebook.com/v20.0/${pageId}`;

    const params = { fields: 'name,fan_count,followers_count,engagement', access_token: acc.accessToken };
    const axios = require('axios');
    const response = await axios.get(url, { params });
    return res.json({ success: true, metrics: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ success: false });
  }
};

export const getPages = async (req, res) => {
  try {
    const { userId } = req.params;

    const pages = await SocialAccount.find({
      user: userId,
      platform: "facebook"
    });

    return res.json({ success: true, pages });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch pages" });
  }
};
