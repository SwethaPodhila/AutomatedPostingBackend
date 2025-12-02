import axios from "axios";
import User from "../models/users.js";

// Facebook OAuth callback
export const facebookCallback = async (req, res) => {
  const { code } = req.query;
  const redirectUri = process.env.FB_REDIRECT_URI;

  try {
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v16.0/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${redirectUri}&client_secret=${process.env.FB_APP_SECRET}&code=${code}`
    );

    const accessToken = tokenRes.data.access_token;

    await User.findByIdAndUpdate(req.userId, { facebookToken: accessToken });

    res.send("Facebook connected successfully!");
  } catch (err) {
    console.error(err);
    res.send("Error connecting Facebook account");
  }
};

// Instagram OAuth callback
export const instagramCallback = async (req, res) => {
  const { code } = req.query;
  const redirectUri = process.env.IG_REDIRECT_URI;

  try {
    const tokenRes = await axios.post(
      `https://api.instagram.com/oauth/access_token`,
      null,
      {
        params: {
          client_id: process.env.IG_APP_ID,
          client_secret: process.env.IG_APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        },
      }
    );

    const accessToken = tokenRes.data.access_token;

    await User.findByIdAndUpdate(req.userId, { instagramToken: accessToken });

    res.send("Instagram connected successfully!");
  } catch (err) {
    console.error(err.response?.data || err);
    res.send("Error connecting Instagram account");
  }
};
