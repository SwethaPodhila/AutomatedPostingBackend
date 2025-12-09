const axios = require("axios");

exports.getLongLivedToken = async (shortLivedToken) => {
  const url = `https://graph.facebook.com/v21.0/oauth/access_token
      ?grant_type=fb_exchange_token
      &client_id=${process.env.IG_APP_ID}
      &client_secret=${process.env.IG_APP_SECRET}
      &fb_exchange_token=${shortLivedToken}`.replace(/\s+/g, "");

  const response = await axios.get(url);
  return response.data.access_token;
};
