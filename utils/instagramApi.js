import axios from "axios";

const IG_GRAPH = "https://graph.facebook.com/v19.0";

/**
 * Exchange short-lived token for a long-lived user token (~60 days).
 * Returns { access_token, expires_in } or throws.
 */
export const getLongLivedToken = async (shortLivedToken) => {
  const url = `https://graph.facebook.com/v21.0/oauth/access_token`
    + `?grant_type=fb_exchange_token`
    + `&client_id=${process.env.FB_APP_ID}`
    + `&client_secret=${process.env.FB_APP_SECRET}`
    + `&fb_exchange_token=${shortLivedToken}`;

  const res = await axios.get(url);
  return res.data; // { access_token, token_type, expires_in }
};

/**
 * Publish post to Instagram (Image / Reel)
 */

// ⏳ Wait until IG finishes processing media
const waitForMediaReady = async (creationId, accessToken) => {
  let status = "IN_PROGRESS";
  let attempts = 0;

  while (status !== "FINISHED" && attempts < 10) {
    await new Promise((r) => setTimeout(r, 3000)); // wait 3 sec

    const statusRes = await axios.get(
      `https://graph.facebook.com/v19.0/${creationId}`,
      {
        params: {
          fields: "status_code",
          access_token: accessToken,
        },
      }
    );

    status = statusRes.data.status_code;
    console.log("⏳ IG MEDIA STATUS:", status);

    attempts++;
  }

  if (status !== "FINISHED") {
    throw new Error("IG media processing timeout");
  }
};

export const publishInstagramUtil = async ({
  igUserId,
  accessToken,
  mediaUrl,
  mediaType,
  caption,
}) => {
  try {
    console.log("🟣 IG UTIL START");
    console.log({ igUserId, mediaType, mediaUrl });

    if (!mediaUrl.startsWith("https://")) {
      throw new Error("Media URL must be public HTTPS");
    }

    // 1️⃣ Create media payload
    const payload =
      mediaType === "video"
        ? {
            media_type: "REELS",
            video_url: mediaUrl,
            caption,
            access_token: accessToken,
          }
        : {
            image_url: mediaUrl,
            caption,
            access_token: accessToken,
          };

    console.log("🟡 IG MEDIA PAYLOAD:", payload);

    // 2️⃣ Create media
    const mediaRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      payload
    );

    console.log("🟢 IG MEDIA CREATED:", mediaRes.data);

    const creationId = mediaRes.data.id;

    // 3️⃣ WAIT until media ready (🔥 IMPORTANT)
    await waitForMediaReady(creationId, accessToken);

    // 4️⃣ Publish media
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        creation_id: creationId,
        access_token: accessToken,
      }
    );

    console.log("🟢 IG PUBLISHED:", publishRes.data);

    return { postId: publishRes.data.id };
  } catch (err) {
    console.error("❌ IG UTIL ERROR FULL:", err.response?.data || err.message);
    throw err;
  }
};