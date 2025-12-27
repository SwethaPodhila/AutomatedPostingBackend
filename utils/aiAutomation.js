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

  // ================== CAPTION ==================
  let caption = "";
  try {
    console.log("🤖 Generating caption...");
    const captionRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional social media marketer" },
        { role: "user", content: `Create a short, catchy social media caption. Topic: ${prompt}` },
      ],
    });

    caption = captionRes.choices[0].message.content.trim();
    console.log("✅ Caption generated:", caption);

  } catch (err) {
    console.error("❌ Caption generation failed:", err?.message || err);
    caption = prompt;
  }

  // ================== IMAGE ==================
  let mediaUrl = null;

  try {
    console.log("🎨 Generating image from OpenAI...");

    const imageRes = await openai.images.generate({
      model: "dall-e-3",
      prompt: `High quality, bright, cheerful social media illustration: ${prompt}`,
      size: "1024x1024",
      response_format: "b64_json",
    });

    console.log("✅ OpenAI image response received");

    const base64 = imageRes?.data?.[0]?.b64_json;
    if (!base64) {
      throw new Error("Base64 image not received from OpenAI");
    }

    console.log("🧩 Base64 length:", base64.length);

    const buffer = Buffer.from(base64, "base64");
    console.log("📦 Image buffer size:", buffer.length);

    console.log("☁️ Uploading image to Cloudinary...");

    mediaUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.v2.uploader.upload_stream(
        {
          folder: "auto_posts",
          public_id: uuidv4(),
        },
        (error, result) => {
          if (error) {
            console.error("❌ Cloudinary upload error:", error);
            reject(error);
          } else {
            console.log("✅ Cloudinary upload success");
            console.log("🔗 Cloudinary URL:", result.secure_url);
            resolve(result.secure_url);
          }
        }
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });

  } catch (err) {
    console.error("❌ IMAGE FLOW FAILED:", err?.message || err);
  }

  console.log("📤 Returning from generateAICaptionAndImage");
  console.log("🖼 mediaUrl:", mediaUrl);

  return {
    caption,
    mediaUrl,
  };
};
