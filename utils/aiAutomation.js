import OpenAI from "openai";
import cloudinary from "cloudinary";
import { v4 as uuidv4 } from "uuid";
import streamifier from "streamifier";

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Cloudinary config
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const generateAICaptionAndImage = async (prompt) => {

  console.log("🟡 generateAICaptionAndImage START");
  console.log("📝 Prompt:", prompt);

  // ✅ Safety check
  if (!prompt || typeof prompt !== "string") {
    throw new Error("❌ Prompt is required");
  }

  // ✅ Detect caption-only mode
  const lowerPrompt = prompt.toLowerCase();
  const captionOnly =
    lowerPrompt.includes("only caption") ||
    lowerPrompt.includes("caption only") ||
    lowerPrompt.includes("no image");

  let caption = "";
  let mediaUrl = null;

  // ================== CAPTION ==================
  try {
    console.log("🤖 Generating caption...");

    const captionRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional content writer. Generate caption based on user requirement.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    caption = captionRes.choices[0].message.content.trim();
    console.log("✅ Caption generated");

  } catch (err) {
    console.error("❌ Caption generation failed:", err?.message || err);
    caption = prompt;
  }

  // ================== IMAGE (DEFAULT: YES) ==================
  if (!captionOnly) {
    try {
      console.log("🎨 Generating image...");

      const imageRes = await openai.images.generate({
        model: "dall-e-3",
        prompt: `
Realistic photo based on: ${prompt}.
Use real people and natural environment.
Indian context if possible.
No cartoon, no illustration, no CGI.
ultra realistic, DSLR, 50mm lens, natural lighting
        `,
        size: "1024x1024",
        response_format: "b64_json",
      });

      const base64 = imageRes?.data?.[0]?.b64_json;
      if (!base64) throw new Error("No image received");

      const buffer = Buffer.from(base64, "base64");

      console.log("☁️ Uploading to Cloudinary...");

      mediaUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream(
          {
            folder: "auto_posts",
            public_id: uuidv4(),
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
      });

      console.log("✅ Image uploaded:", mediaUrl);

    } catch (err) {
      console.error("❌ IMAGE FLOW FAILED:", err?.message || err);
    }
  } else {
    console.log("🚫 Caption only requested → Skipping image");
  }

  console.log("📤 Done");

  return {
    caption,
    mediaUrl, // null if caption only
  };
};