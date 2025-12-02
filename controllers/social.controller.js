import axios from "axios";
import User from "../models/users.js";

// Facebook OAuth callback
export const facebookCallback = async (req, res) => {
    const { code } = req.query;
    const redirectUri = process.env.FB_REDIRECT_URI;

    try {
        const tokenRes = await axios.get(
            `https://www.facebook.com/v16.0/dialog/oauth
  ?client_id=4196581700605802
  &redirect_uri=http://localhost:5000/api/social/facebook/callback
  &scope=public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata`
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
