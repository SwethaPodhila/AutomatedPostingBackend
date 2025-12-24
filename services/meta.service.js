// services/meta.service.js
import axios from "axios";

export async function postToFacebook(pageId, accessToken, caption, imageUrl) {
  const res = await axios.post(
    `https://graph.facebook.com/v19.0/${pageId}/photos`,
    {
      url: imageUrl,
      caption,
      access_token: accessToken
    }
  );

  return res.data;
}
