// services/ai.service.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generateCaption(prompt, day) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: `
Create a social media caption.
Base idea: ${prompt}
Day: ${day}
Make it unique, engaging, with hashtags.
`
    }]
  });

  return res.choices[0].message.content;
}

export async function generateImage(prompt) {
  const img = await openai.images.generate({
    model: "gpt-image-1",
    prompt: `
Create a professional social media image for:
${prompt}
`,
    size: "1024x1024"
  });

  return img.data[0].url;
}
