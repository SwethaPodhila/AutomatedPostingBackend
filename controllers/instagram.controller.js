import axios from "axios";
import SocialAccount from "../models/socialAccount.js";
import { getLongLivedToken } from "../utils/instagramApi.js";

export const redirectToLogin = async (req, res) => {
  try {
    const { userId } = req.query;

    const scopes = [
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_insights",
      "public_profile"
    ].join(",");

    const fbLoginUrl =
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${process.env.FB_APP_ID}&redirect_uri=${process.env.SERVER_URL}/social/instagram/callback&scope=${scopes}&state=${userId}`;

    return res.redirect(fbLoginUrl);
  } catch (error) {
    console.error("IG Redirect Error:", error);
    res.status(500).json({ error: "Redirect error" });
  }
};

export const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query; // state = userId
    const userId = state;

    // Step 1 → Short-lived token
    const tokenUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${process.env.SERVER_URL}/social/instagram/callback&client_secret=${process.env.FB_APP_SECRET}&code=${code}`;

    const tokenRes = await axios.get(tokenUrl);
    const shortLivedToken = tokenRes.data.access_token;

    // Step 2 → Convert to long-lived
    const longToken = await getLongLivedToken(shortLivedToken);

    // Step 3 → Get pages
    const pagesUrl = `https://graph.facebook.com/me/accounts?access_token=${longToken}`;
    const pagesRes = await axios.get(pagesUrl);

    if (!pagesRes.data.data.length)
      return res.send("No Facebook Page connected to this IG account!");

    const page = pagesRes.data.data[0];
    const pageId = page.id;
    const pageAccessToken = page.access_token;

    // Step 4 → Get IG Business Account ID
    const igUrl =
      `https://graph.facebook.com/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`;

    const igRes = await axios.get(igUrl);
    const igUserId = igRes.data.instagram_business_account.id;

    // Step 5 → Save in DB
    await SocialAccount.create({
      user: userId,
      platform: "instagram",
      providerId: igUserId,
      accessToken: pageAccessToken,
      refreshToken: longToken,
      meta: {
        fbPageId: pageId,
        linkedPageToken: pageAccessToken
      }
    });

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?instagram=success`);
  } catch (error) {
    console.error("IG Callback Error:", error.response?.data || error);
    res.status(500).json({ error: "Instagram connection failed" });
  }
};

export const postToInstagram = async (req, res) => {
  try {
    const { userId, imageUrl, caption } = req.body;

    const account = await SocialAccount.findOne({
      user: userId,
      platform: "instagram"
    });

    if (!account) {
      return res.status(404).json({ error: "Instagram not connected!" });
    }

    const igUserId = account.providerId;
    const token = account.accessToken;

    // Step 1 → Create IG media container
    const createUrl =
      `https://graph.facebook.com/v21.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`;

    const createRes = await axios.post(createUrl);
    const creationId = createRes.data.id;

    // Step 2 → Publish media
    const publishUrl =
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${creationId}&access_token=${token}`;

    await axios.post(publishUrl);

    res.json({ message: "Post uploaded to Instagram!" });
  } catch (error) {
    console.error("IG Post Error:", error.response?.data || error);
    res.status(500).json({ error: "Failed to post" });
  }
};