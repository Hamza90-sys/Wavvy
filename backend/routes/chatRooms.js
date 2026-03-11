const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const ChatRoom = require("../models/ChatRoom");
const Message = require("../models/Message");
const User = require("../models/User");
const RoomJoinRequest = require("../models/RoomJoinRequest");
const auth = require("../middleware/auth");
const { createNotification } = require("../utils/notifications");

const router = express.Router();
const uploadsDir = path.join(__dirname, "..", "uploads", "rooms");
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
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

router.use(auth);

const isRoomAdmin = (room, userId) =>
  room.createdBy?.toString?.() === userId || room.admins.some((adminId) => adminId.toString() === userId);

const isRoomMember = (room, userId) => room.members.some((memberId) => memberId.toString() === userId);

const toSafeUser = (user, viewerId) => {
  if (!user) return user;
  const visibility = user.preferences?.visibility || "friends";
  const canSee = user._id?.toString?.() === viewerId || visibility !== "invisible";
  return {
    _id: user._id,
    id: user._id,
    username: user.username,
    displayName: canSee ? user.displayName || user.username : "Hidden",
    avatarUrl: canSee ? user.avatarUrl : null,
    avatarColor: user.avatarColor,
    status: canSee ? user.status : null,
    presenceStatus: user.presenceStatus || "offline",
    lastSeen: user.lastSeen || null,
    visibility
  };
};

const scrubRoom = (roomDoc, viewerId) => {
  if (!roomDoc) return roomDoc;
  const room = roomDoc.toObject();
  room.createdBy = room.createdBy ? toSafeUser(room.createdBy, viewerId) : null;
  room.admins = (room.admins || []).map((admin) => toSafeUser(admin, viewerId));
  room.members = (room.members || []).map((member) => toSafeUser(member, viewerId));
  return room;
};

router.get("/", async (req, res) => {
  try {
    const rooms = await ChatRoom.find({})
      .populate("createdBy", "username displayName avatarUrl avatarColor status preferences.visibility")
      .populate("admins", "username displayName avatarUrl avatarColor status preferences.visibility")
      .populate("members", "username displayName avatarUrl avatarColor status preferences.visibility")
      .sort({ createdAt: -1 });
    return res.json({ rooms: rooms.map((room) => scrubRoom(room, req.user.id)) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load rooms", error: error.message });
  }
});

router.post("/direct/:userId", async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    if (!targetUserId || targetUserId === req.user.id) {
      return res.status(400).json({ message: "Invalid user" });
    }

    const targetUser = await User.findById(targetUserId).select("_id username");
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const existing = await ChatRoom.findOne({
      $and: [
        { members: { $all: [req.user.id, targetUserId] } },
        { members: { $size: 2 } },
        { isPrivate: true },
        { roomType: "normal" }
      ]
    })
      .populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");

    if (existing) {
      return res.json({ room: scrubRoom(existing, req.user.id) });
    }

    const suffix = Date.now().toString(36).slice(-4);
    const safeName = `dm-${req.user.id.slice(-6)}-${targetUserId.slice(-6)}-${suffix}`;

    const room = await ChatRoom.create({
      name: safeName,
      description: "Direct chat",
      isPrivate: true,
      roomType: "normal",
      createdBy: req.user.id,
      admins: [req.user.id],
      members: [req.user.id, targetUserId]
    });

    const populated = await room.populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");
    return res.status(201).json({ room: scrubRoom(populated, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create direct chat", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, description, isPrivate, roomType } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }
    const safeRoomType = roomType === "voice" ? "voice" : "normal";

    const room = await ChatRoom.create({
      name,
      description: description || "",
      isPrivate: Boolean(isPrivate),
      roomType: safeRoomType,
      createdBy: req.user.id,
      admins: [req.user.id],
      members: [req.user.id]
    });

    const populated = await room.populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");
    return res.status(201).json({ room: scrubRoom(populated, req.user.id) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Room name already exists" });
    }
    return res.status(500).json({ message: "Failed to create room", error: error.message });
  }
});

router.post("/:roomId/join", async (req, res) => {
  try {
    const existingRoom = await ChatRoom.findById(req.params.roomId)
      .populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");
    const room = existingRoom;
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (isRoomMember(room, req.user.id)) {
      return res.json({ room: scrubRoom(room, req.user.id), alreadyMember: true });
    }

    if (room.isPrivate) {
      const existingRequest = await RoomJoinRequest.findOne({
        roomId: room._id,
        requesterId: req.user.id,
        status: "pending"
      });
      if (existingRequest) {
        return res.json({ ok: true, requested: true, message: "Join request already pending" });
      }

      const request = await RoomJoinRequest.create({
        roomId: room._id,
        requesterId: req.user.id
      });

      const requester = await User.findById(req.user.id).select("username displayName");
      const requesterName = requester?.displayName || requester?.username || "Someone";
      const adminIds = new Set([
        room.createdBy?._id?.toString?.() || room.createdBy?.toString?.(),
        ...(room.admins || []).map((admin) => admin._id?.toString?.() || admin.toString())
      ]);
      const io = req.app.get("io");
      await Promise.all(
        Array.from(adminIds)
          .filter((adminId) => adminId && adminId !== req.user.id)
          .map((adminId) =>
            createNotification(
              {
                type: "JOIN_ROOM_REQUEST",
                senderId: req.user.id,
                receiverId: adminId,
                roomId: room._id,
                requestId: request._id,
                message: `${requesterName} requested to join your room`
              },
              io
            )
          )
      );

      return res.json({ ok: true, requested: true, message: "Join request sent" });
    }

    const joinedRoom = await ChatRoom.findByIdAndUpdate(
      req.params.roomId,
      { $addToSet: { members: req.user.id } },
      { new: true }
    ).populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");

    return res.json({ room: scrubRoom(joinedRoom, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to join room", error: error.message });
  }
});

router.post("/:roomId/leave", async (req, res) => {
  try {
    const existingRoom = await ChatRoom.findById(req.params.roomId);
    if (!existingRoom) {
      return res.status(404).json({ message: "Room not found" });
    }
    if (existingRoom.createdBy.toString() === req.user.id) {
      return res.status(400).json({ message: "Room owner cannot leave. Delete room instead." });
    }

    const room = await ChatRoom.findByIdAndUpdate(
      req.params.roomId,
      { $pull: { members: req.user.id, admins: req.user.id } },
      { new: true }
    ).populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    return res.json({ room: scrubRoom(room, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to leave room", error: error.message });
  }
});

router.patch("/:roomId", async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res.status(403).json({ message: "Only room admins can update room settings" });
    }

    const updates = {};
    if (typeof req.body.name === "string") {
      updates.name = req.body.name.trim();
    }
    if (typeof req.body.description === "string") {
      updates.description = req.body.description.trim();
    }

    if (updates.name !== undefined && updates.name.length < 2) {
      return res.status(400).json({ message: "Room name must be at least 2 characters" });
    }

    const updatedRoom = await ChatRoom.findByIdAndUpdate(req.params.roomId, { $set: updates }, { new: true, runValidators: true })
      .populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");

    return res.json({ room: scrubRoom(updatedRoom, req.user.id) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Room name already exists" });
    }
    return res.status(500).json({ message: "Failed to update room", error: error.message });
  }
});

router.post("/:roomId/avatar", upload.single("avatar"), async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res.status(403).json({ message: "Only room admins can update room avatar" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Avatar file is required" });
    }
    if (!req.file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ message: "Avatar must be an image file" });
    }

    const avatarUrl = `/uploads/rooms/${req.file.filename}`;
    const updatedRoom = await ChatRoom.findByIdAndUpdate(
      room._id,
      { $set: { avatarUrl } },
      { new: true }
    ).populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");

    return res.json({ room: scrubRoom(updatedRoom, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update room avatar", error: error.message });
  }
});

router.get("/:roomId/profile", async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId)
      .populate("createdBy", "username displayName avatarUrl avatarColor")
      .populate("admins", "username displayName avatarUrl avatarColor")
      .populate("members", "_id");
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const primaryAdmin = room.createdBy || room.admins?.[0] || null;
    const isMember = (room.members || []).some((member) => (member._id || member).toString() === req.user.id);
    const pendingRequest = await RoomJoinRequest.findOne({
      roomId: room._id,
      requesterId: req.user.id,
      status: "pending"
    }).select("_id");

    return res.json({
      room: {
        id: room._id.toString(),
        name: room.name,
        description: room.description || "",
        roomType: room.roomType || "normal",
        avatarUrl: room.avatarUrl || "",
        isPrivate: Boolean(room.isPrivate),
        isMember,
        admin: primaryAdmin
          ? {
              id: primaryAdmin._id.toString(),
              username: primaryAdmin.username,
              displayName: primaryAdmin.displayName || primaryAdmin.username,
              avatarUrl: primaryAdmin.avatarUrl || "",
              avatarColor: primaryAdmin.avatarColor || ""
            }
          : null
      },
      joinRequestPending: Boolean(pendingRequest)
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load room profile", error: error.message });
  }
});

router.get("/:roomId/media", async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!isRoomMember(room, req.user.id)) {
      return res.status(403).json({ message: "Only room members can view media" });
    }

    const messages = await Message.find({ room: room._id, "attachments.mimeType": { $regex: /^(image|video)\// } })
      .select("attachments createdAt user")
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("user", "username");

    const images = [];
    messages.forEach((message) => {
      (message.attachments || []).forEach((attachment) => {
        if (attachment.mimeType?.startsWith("image/") || attachment.mimeType?.startsWith("video/")) {
          images.push({
            url: attachment.url,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            createdAt: message.createdAt,
            user: message.user ? { id: message.user._id, username: message.user.username } : null
          });
        }
      });
    });

    return res.json({ images });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load room media", error: error.message });
  }
});

router.delete("/:roomId", async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res.status(403).json({ message: "Only room admins can delete this room" });
    }

    await ChatRoom.deleteOne({ _id: room._id });
    return res.json({ roomId: room._id.toString() });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete room", error: error.message });
  }
});

router.post("/:roomId/kick/:userId", async (req, res) => {
  try {
    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!isRoomAdmin(room, req.user.id)) {
      return res.status(403).json({ message: "Only room admins can kick members" });
    }

    const targetUserId = req.params.userId;
    if (targetUserId === room.createdBy.toString()) {
      return res.status(400).json({ message: "Cannot kick the room owner" });
    }

    await ChatRoom.findByIdAndUpdate(room._id, {
      $pull: { members: targetUserId, admins: targetUserId }
    });

    const updatedRoom = await ChatRoom.findById(room._id).populate("createdBy admins members", "username displayName avatarUrl avatarColor status preferences.visibility");
    return res.json({ room: scrubRoom(updatedRoom, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to kick member", error: error.message });
  }
});

module.exports = router;
