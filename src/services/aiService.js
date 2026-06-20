const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://gabr83-graduationproject.hf.space";

const ANALYZE_ENDPOINT = `${AI_BASE_URL}/analyze`;

/**
 * Send a file to the /analyze endpoint and return a normalized
 * topics array that matches our Document model shape.
 *
 * API contract (multipart/form-data POST /analyze):
 *   Request  → field "file" (binary)
 *   Response → { total_topics: number, topics: TopicResult[] }
 *
 * TopicResult → { title, summary, videos: VideoItem[] }
 * VideoItem   → { title, channel, link, thumbnail }
 *
 * @param {string} filePath  - Absolute path to the uploaded file on disk
 * @param {string} mimeType  - MIME type of the file
 * @returns {Promise<Array>} - Normalized topics array for storage in Document
 */
const processDocument = async (filePath, mimeType) => {
  const form = new FormData();

  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeType,
  });

  const response = await axios.post(ANALYZE_ENDPOINT, form, {
    headers: {
      ...form.getHeaders(),
    },
    timeout: 300000, // 5 minutes — AI processing can be slow
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const data = response.data;

  // Validate the response matches the expected schema
  if (
    !data ||
    typeof data.total_topics !== "number" ||
    !Array.isArray(data.topics)
  ) {
    throw new Error(
      `Unexpected AI response structure: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  if (data.topics.length === 0) {
    throw new Error("AI returned no topics from the document");
  }

  // Normalize to our internal shape (add videoId extracted from link)
  return data.topics.map((topic) => ({
    title: topic.title || "Educational Topic",
    summary: topic.summary || "",
    videos: (topic.videos || []).map((v) => ({
      title: v.title || "",
      channel: v.channel || "",
      link: v.link || "",
      thumbnail: v.thumbnail || "",
      videoId: extractVideoId(v.link || ""),
    })),
  }));
};

/**
 * Extract YouTube video ID from a watch URL.
 * e.g. https://www.youtube.com/watch?v=abc123 → "abc123"
 */
const extractVideoId = (url) => {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : "";
};

/**
 * Ping the root endpoint to check if the AI service is reachable.
 */
const pingAI = async () => {
  try {
    const res = await axios.get(`${AI_BASE_URL}/`, { timeout: 10000 });
    return res.status === 200;
  } catch (_) {
    return false;
  }
};

module.exports = { processDocument, pingAI };
