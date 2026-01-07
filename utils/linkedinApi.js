import axios from "axios";

/**
 * Waits for a LinkedIn video asset to become READY
 * For videos only (images can skip this)
 */
const waitForAssetReady = async (
  assetUrn,
  accessToken,
  maxRetries = 50,
  interval = 5000
) => {
  console.log("⏳ Waiting for video asset to be ready:", assetUrn);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await axios.get(
        `https://api.linkedin.com/v2/assets/${encodeURIComponent(assetUrn)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      const status = res.data.status?.state;
      console.log(`Asset status [${i + 1}]:`, status);

      if (status === "READY") {
        console.log("✅ Video asset is ready");
        return true;
      }
    } catch (err) {
      // Treat 400 as "asset not ready yet"
      if (err.response?.status === 400) {
        console.log(`ℹ️ Asset not ready yet [${i + 1}]`);
      } else {
        console.error("❌ Unexpected error:", err.response?.data || err.message);
      }
    }

    // Exponential backoff
    await new Promise((r) => setTimeout(r, interval * (i + 1)));
  }

  throw new Error("Asset not ready after multiple retries");
};

/**
 * Publish a post to LinkedIn (text, image, video)
 */
export const publishToLinkedIn = async ({
  accessToken,
  providerId,
  content,
  mediaUrl = null,
  mediaType = null, // "image" or "video"
}) => {
  console.log("🚀 Starting LinkedIn post...");
  console.log("Provider ID:", providerId);
  console.log("Content:", content);
  console.log("Media URL:", mediaUrl);
  console.log("Media Type:", mediaType);

  let assetUrn = null;
  let shareMediaCategory = "NONE";

  // ================= MEDIA UPLOAD =================
  if (mediaUrl && mediaType) {
    shareMediaCategory = mediaType === "video" ? "VIDEO" : "IMAGE";

    let contentType;
    if (mediaType === "video") contentType = "video/mp4";
    else if (mediaUrl.endsWith(".png")) contentType = "image/png";
    else contentType = "image/jpeg";

    try {
      console.log("📄 Registering upload for asset...");
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

      console.log("✅ Upload registered:", registerRes.data);

      const uploadMechanism =
        registerRes.data.value.uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ];
      const uploadUrl = uploadMechanism.uploadUrl;
      const uploadHeaders = uploadMechanism.headers || {};
      assetUrn = registerRes.data.value.asset;

      console.log("📤 Uploading media to LinkedIn...");
      const mediaResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        maxRedirects: 5,
      });
      const fileBuffer = Buffer.from(mediaResponse.data);

      await axios.put(uploadUrl, fileBuffer, {
        headers: {
          ...uploadHeaders,
          "Content-Type": contentType,
          "Content-Length": fileBuffer.length,
        },
        maxBodyLength: Infinity,
      });
      console.log("✅ Media uploaded");

      // For videos only, wait until LinkedIn marks asset READY
      if (mediaType === "video") {
        await waitForAssetReady(assetUrn, accessToken);
      } else {
        console.log("ℹ️ Image upload done, skipping wait (LinkedIn will process it automatically)");
      }
    } catch (err) {
      console.error("❌ Media upload failed:", err.response?.data || err.message);
      throw err;
    }
  }

  // ================= POST CREATION =================
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

  console.log("📢 Post payload:", JSON.stringify(postPayload, null, 2));

  try {
    const postRes = await axios.post("https://api.linkedin.com/v2/ugcPosts", postPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    console.log("✅ Post successful:", postRes.data);
    return {
      postId: postRes.data.id,
      postUrl: `https://www.linkedin.com/feed/update/${postRes.data.id}`,
    };
  } catch (err) {
    console.error("❌ Post creation failed:", err.response?.data || err.message);
    throw err;
  }
};