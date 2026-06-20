const axios = require("axios");

const YT_BASE = "https://www.googleapis.com/youtube/v3";

const searchVideos = async (query, maxResults = 3) => {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.warn("⚠️  YOUTUBE_API_KEY not set — skipping video search");
    return [];
  }

  try {
    const response = await axios.get(`${YT_BASE}/search`, {
      params: {
        key: apiKey,
        q: query,
        part: "snippet",
        type: "video",
        maxResults,
        relevanceLanguage: "en",
        safeSearch: "strict",
      },
      timeout: 15000,
    });

    return response.data.items.map((item) => ({
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      videoId: item.id.videoId,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || "",
      link: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
  } catch (err) {
    console.error("YouTube API error:", err?.response?.data || err.message);
    return [];
  }
};

module.exports = { searchVideos };
