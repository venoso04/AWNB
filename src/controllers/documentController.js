const fs = require("fs");
const Document = require("../models/Document");
const { getMimeFileType } = require("../middleware/upload");
const { processDocument } = require("../services/aiService");
const { searchVideos } = require("../services/youtubeService");
const { success, error } = require("../utils/response");

// ══════════════════════════════════════════════════════════
// @route   POST /api/documents/upload
// @access  Private
// ══════════════════════════════════════════════════════════
const uploadDocument = async (req, res) => {
  if (!req.file) {
    return error(res, "No file uploaded", 400);
  }

  let doc;
  try {
    const fileType = getMimeFileType(req.file.mimetype);

    doc = await Document.create({
      user: req.user._id,
      originalName: req.file.originalname,
      fileType,
      fileSize: req.file.size,
      storagePath: req.file.path,
      status: "pending",
    });

    success(res, { document: doc }, "File uploaded, processing started", 202);

    // ── Async processing (response already sent above) ────
    doc.status = "processing";
    doc.processingStartedAt = new Date();
    await doc.save();

    let topics;

    try {
      topics = await processDocument(req.file.path, req.file.mimetype);
    } catch (aiErr) {
      console.error("AI processing error:", aiErr.message);
      doc.status = "failed";
      doc.errorMessage = aiErr.message;
      await doc.save();
      return;
    }

    const enrichedTopics = await Promise.all(
      topics.map(async (topic) => {
        let videos = topic.videos || [];
        if (videos.length === 0 && topic.title) {
          videos = await searchVideos(topic.title, 3);
        }
        return { ...topic, videos };
      })
    );

    doc.topics = enrichedTopics;
    doc.status = "done";
    doc.processingFinishedAt = new Date();
    await doc.save();

    console.log(`✅ Document ${doc._id} processed: ${enrichedTopics.length} topics`);
  } catch (err) {
    console.error("uploadDocument error:", err);
    if (doc && doc._id) {
      try {
        await Document.findByIdAndUpdate(doc._id, {
          status: "failed",
          errorMessage: err.message,
        });
      } catch (_) {}
    }
  }
};

// ══════════════════════════════════════════════════════════
// @route   GET /api/documents
// @access  Private
// ══════════════════════════════════════════════════════════
const listDocuments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .select("-storagePath -topics")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Document.countDocuments(filter),
    ]);

    return success(res, {
      documents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("listDocuments error:", err);
    return error(res, "Failed to fetch documents", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   GET /api/documents/:id
// @access  Private
// ══════════════════════════════════════════════════════════
const getDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).select("-storagePath");

    if (!doc) {
      return error(res, "Document not found", 404);
    }

    return success(res, { document: doc });
  } catch (err) {
    console.error("getDocument error:", err);
    return error(res, "Failed to fetch document", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   GET /api/documents/:id/status
// @access  Private
// ══════════════════════════════════════════════════════════
const getDocumentStatus = async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).select("status errorMessage processingStartedAt processingFinishedAt");

    if (!doc) {
      return error(res, "Document not found", 404);
    }

    return success(res, { status: doc.status, errorMessage: doc.errorMessage });
  } catch (err) {
    return error(res, "Failed to fetch status", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   DELETE /api/documents/:id
// @access  Private
// ══════════════════════════════════════════════════════════
const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!doc) {
      return error(res, "Document not found", 404);
    }

    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      fs.unlinkSync(doc.storagePath);
    }

    await doc.deleteOne();

    return success(res, {}, "Document deleted");
  } catch (err) {
    console.error("deleteDocument error:", err);
    return error(res, "Failed to delete document", 500);
  }
};

// ══════════════════════════════════════════════════════════
// @route   GET /api/documents/:id/topics/:topicIndex/videos/refresh
// @access  Private
// ══════════════════════════════════════════════════════════
const refreshTopicVideos = async (req, res) => {
  try {
    const doc = await Document.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!doc) return error(res, "Document not found", 404);

    const idx = parseInt(req.params.topicIndex, 10);
    if (isNaN(idx) || !doc.topics[idx]) {
      return error(res, "Topic not found", 404);
    }

    const videos = await searchVideos(doc.topics[idx].title, 3);
    doc.topics[idx].videos = videos;
    await doc.save();

    return success(res, { videos }, "Videos refreshed");
  } catch (err) {
    return error(res, "Failed to refresh videos", 500);
  }
};

module.exports = {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentStatus,
  deleteDocument,
  refreshTopicVideos,
};
