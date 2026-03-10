const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const Message = require("../models/Message");
const ChatRoom = require("../models/ChatRoom");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();
const uploadsDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 5 }
});

router.use(auth);

router.get("/:roomId", async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId).select("_id members");
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    const isMember = room.members.some((memberId) => memberId.toString() === req.user.id);
    if (!isMember) {
      return res.status(403).json({ message: "You must join this room before viewing messages" });
    }

    const blocked = await User.findOne({ _id: { $in: room.members }, blockedUsers: req.user.id }).select("_id");
    if (blocked) {
      return res.status(403).json({ message: "You cannot view this conversation" });
    }

    const messages = await Message.find({ room: req.params.roomId })
      .populate("user", "username displayName avatarColor avatarUrl status")
      .populate("reactions.users", "username displayName")
      .sort({ createdAt: 1 })
      .limit(300);

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch messages", error: error.message });
  }
});

router.post("/upload", upload.array("files", 5), async (req, res) => {
  try {
    const { roomId } = req.body;
    if (!roomId) {
      return res.status(400).json({ message: "roomId is required" });
    }
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    const isMember = room.members.some((memberId) => memberId.toString() === req.user.id);
    if (!isMember) {
      return res.status(403).json({ message: "You must join the room before uploading files" });
    }

    const blocked = await User.findOne({ _id: { $in: room.members }, blockedUsers: req.user.id }).select("_id");
    if (blocked) {
      return res.status(403).json({ message: "You cannot send files in this room" });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    let attachmentMetaByName = {};
    if (req.body.attachmentMeta) {
      try {
        const parsed = JSON.parse(req.body.attachmentMeta);
        if (Array.isArray(parsed)) {
          attachmentMetaByName = parsed.reduce((acc, item) => {
            if (!item?.fileName) return acc;
            acc[item.fileName] = {
              duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : undefined
            };
            return acc;
          }, {});
        }
      } catch (_error) {
        attachmentMetaByName = {};
      }
    }

    const attachments = files.map((file) => ({
      url: `/uploads/${file.filename}`,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      size: file.size,
      duration: attachmentMetaByName[file.originalname]?.duration
    }));

    return res.status(201).json({ attachments });
  } catch (error) {
    return res.status(500).json({ message: "File upload failed", error: error.message });
  }
});

module.exports = router;
