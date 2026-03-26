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

/**
 * mode:
 * "caption" → only caption
 * "image"   → caption + image
 */
export const generateAIContent = async ({ prompt, mode = "caption" }) => {
  console.log("🟡 generateAIContent START");
  console.log("📝 Prompt:", prompt);
  console.log("📌 Mode:", mode);

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
          content:
            "You are a professional content writer. Generate only caption text based on the given prompt.",
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

  // ================== IMAGE (ONLY IF mode === "image") ==================
  if (mode === "image") {
    try {
      console.log("🎨 Generating realistic image...");

      const imageRes = await openai.images.generate({
        model: "dall-e-3",
        prompt: `
Realistic photo related to: ${prompt}.
Use Indian context if applicable.
Show real people (workers, professionals, business environment).
Natural lighting, real environment, candid moment.
No cartoon, no illustration, no CGI, no artificial style.
ultra realistic, DSLR, 50mm lens, natural skin tones
        `,
        size: "1024x1024",
        response_format: "b64_json",
      });

      console.log("✅ Image generated from OpenAI");

      const base64 = imageRes?.data?.[0]?.b64_json;
      if (!base64) throw new Error("No base64 image received");

      const buffer = Buffer.from(base64, "base64");

      console.log("☁️ Uploading to Cloudinary...");

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
              resolve(result.secure_url);
            }
          }
        );

        streamifier.createReadStream(buffer).pipe(uploadStream);
      });

    } catch (err) {
      console.error("❌ IMAGE FLOW FAILED:", err?.message || err);
    }
  }

  console.log("📤 Returning response");

  return {
    caption,
    mediaUrl, // null if caption only
  };
};

