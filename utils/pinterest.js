import axios from "axios";

export const publishToPinterest = async ({
  accessToken,
  boardId,
  title,
  description,
  imageUrl,
  link,
}) => {
  try {
    console.log("\n📌 Pinterest Publish Attempt");
    console.log("Board ID:", boardId);
    console.log("Title:", title);
    console.log("Description:", description);
    console.log("Image URL:", imageUrl);
    console.log("Link:", link);
    console.log("Access Token:", accessToken ? accessToken.slice(0, 10) + "..." : "undefined"); // hide full token

    const res = await axios.post(
      "https://api-sandbox.pinterest.com/v5/pins",
      {
        board_id: boardId,
        title: title || "New Post",
        description: description || "",
        media_source: {
          source_type: "image_url",
          url: imageUrl,
        },
        link: link || undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Pinterest API Response:", res.data);
    return res.data;
  } catch (err) {
    console.error("❌ Pinterest Publish Error:");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Response Data:", err.response.data);
    } else {
      console.error("Error Message:", err.message);
    }

    throw err; // rethrow so your cron handler can mark as failed
  }
};
