import { BskyAgent } from "@atproto/api";
import fetch from "node-fetch";
import sharp from "sharp";

export const publishToBlueskyWithImage = async ({
  service = "https://bsky.social",
  did,
  accessJwt,
  refreshJwt,
  message,
  imageUrl,
}) => {
  console.log("⬇️ DOWNLOADING IMAGE:", imageUrl);

  const agent = new BskyAgent({ service });

  await agent.resumeSession({
    did,
    accessJwt,
    refreshJwt,
  });

  const res = await fetch(imageUrl);
  const originalBuffer = Buffer.from(await res.arrayBuffer());

  console.log("📦 ORIGINAL SIZE:", originalBuffer.length);

  // 🔥 WEBP → JPEG
  const jpegBuffer = await sharp(originalBuffer)
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log("🖼️ JPEG SIZE:", jpegBuffer.length);

  const uploadRes = await agent.uploadBlob(jpegBuffer, {
    encoding: "image/jpeg",
  });

  const blob = uploadRes.data.blob;

  return agent.post({
    text: message,
    createdAt: new Date().toISOString(),
    embed: {
      $type: "app.bsky.embed.images",
      images: [
        {
          image: blob,
          alt: message || "image",
        },
      ],
    },
  });
};