import axios from "axios";

export const publishToLinkedIn = async ({
  accessToken,
  providerId,
  content,
  file = null,
  mediaType = null,
}) => {

  let assetUrn = null;
  let shareMediaCategory = "NONE";

  // ================= MEDIA =================
  if (file && mediaType) {

    shareMediaCategory = mediaType === "video" ? "VIDEO" : "IMAGE";

    // 1️⃣ Register upload
    const registerRes = await axios.post(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        registerUploadRequest: {
          owner: `urn:li:person:${providerId}`,
          recipes: [
            mediaType === "video"
              ? "urn:li:digitalmediaRecipe:feedshare-video"
              : "urn:li:digitalmediaRecipe:feedshare-image",
          ],
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    const uploadUrl =
      registerRes.data.value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ].uploadUrl;

    assetUrn = registerRes.data.value.asset;

    // 2️⃣ Upload media (BUFFER)
    await axios.put(uploadUrl, file.buffer, {
      headers: {
        "Content-Type": file.mimetype,
        "Content-Length": file.buffer.length,
      },
      maxBodyLength: Infinity,
    });
  }

  // ================= POST =================
  const postPayload = {
    author: `urn:li:person:${providerId}`,
    lifecycleState: "PUBLISHED",
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content || "" },
        shareMediaCategory,
        ...(assetUrn && {
          media: [
            {
              status: "READY",
              media: assetUrn,
              description: { text: content || "" },
            },
          ],
        }),
      },
    },
  };

  const postRes = await axios.post(
    "https://api.linkedin.com/v2/ugcPosts",
    postPayload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  return {
    postId: postRes.data.id,
    postUrl: `https://www.linkedin.com/feed/update/${postRes.data.id}`,
  };
};
