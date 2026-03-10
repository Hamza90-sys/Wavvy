const express = require("express");
const Notification = require("../models/Notification");
const FollowRequest = require("../models/FollowRequest");
const RoomJoinRequest = require("../models/RoomJoinRequest");
const User = require("../models/User");
const ChatRoom = require("../models/ChatRoom");
const auth = require("../middleware/auth");
const { createNotification, serializeNotification } = require("../utils/notifications");

const router = express.Router();

router.use(auth);

const loadActor = async (userId) =>
  User.findById(userId).select("_id username displayName avatarUrl avatarColor");

router.get("/", async (req, res) => {
  try {
    const notifications = await Notification.find({ receiverId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("senderId", "username displayName avatarUrl avatarColor")
      .populate("roomId", "name");
    const unreadCount = notifications.reduce((count, item) => count + (item.isRead ? 0 : 1), 0);
    return res.json({
      notifications: notifications.map((item) => serializeNotification(item)),
      unreadCount
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load notifications", error: error.message });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { receiverId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.json({ ok: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    return res.status(500).json({ message: "Failed to mark notifications as read", error: error.message });
  }
});

router.post("/:notificationId/accept", async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      receiverId: req.user.id
    });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const io = req.app.get("io");
    const actor = await loadActor(req.user.id);
    const actorName = actor?.displayName || actor?.username || "Someone";

    if (notification.type === "FOLLOW_REQUEST") {
      const request = await FollowRequest.findOne({
        _id: notification.requestId,
        receiverId: req.user.id
      });
      if (!request) {
        notification.isRead = true;
        await notification.save();
        return res.json({ ok: true, notification: serializeNotification(notification) });
      }

      if (request.status === "pending") {
        request.status = "accepted";
        request.respondedAt = new Date();
        await request.save();

        await User.findByIdAndUpdate(request.senderId, { $addToSet: { following: request.receiverId } });
        await User.findByIdAndUpdate(request.receiverId, { $addToSet: { followers: request.senderId } });

        await createNotification(
          {
            type: "FOLLOW_ACCEPTED",
            senderId: request.receiverId,
            receiverId: request.senderId,
            requestId: request._id,
            message: `${actorName} accepted your follow request`
          },
          io
        );

        const requester = await loadActor(request.senderId);
        const requesterName = requester?.displayName || requester?.username || "Someone";
        await createNotification(
          {
            type: "NEW_FOLLOWER",
            senderId: request.senderId,
            receiverId: request.receiverId,
            requestId: request._id,
            message: `${requesterName} started following you`
          },
          io
        );
      }
    } else if (notification.type === "JOIN_ROOM_REQUEST") {
      const request = await RoomJoinRequest.findOne({
        _id: notification.requestId,
        roomId: notification.roomId
      });
      if (!request) {
        notification.isRead = true;
        await notification.save();
        return res.json({ ok: true, notification: serializeNotification(notification) });
      }

      const room = await ChatRoom.findById(request.roomId);
      if (!room) {
        notification.isRead = true;
        await notification.save();
        return res.json({ ok: true, notification: serializeNotification(notification) });
      }

      const isAdmin = room.createdBy.toString() === req.user.id || (room.admins || []).some((adminId) => adminId.toString() === req.user.id);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only room admins can accept join requests" });
      }

      if (request.status === "pending") {
        request.status = "accepted";
        request.reviewedBy = req.user.id;
        request.reviewedAt = new Date();
        await request.save();

        await ChatRoom.findByIdAndUpdate(room._id, { $addToSet: { members: request.requesterId } });

        await createNotification(
          {
            type: "JOIN_ROOM_ACCEPTED",
            senderId: req.user.id,
            receiverId: request.requesterId,
            roomId: room._id,
            requestId: request._id,
            message: `You were accepted into ${room.name}`
          },
          io
        );
      }
    } else {
      return res.status(400).json({ message: "This notification does not support accept action" });
    }

    notification.isRead = true;
    await notification.save();
    const populated = await Notification.findById(notification._id)
      .populate("senderId", "username displayName avatarUrl avatarColor")
      .populate("roomId", "name");

    return res.json({ ok: true, notification: serializeNotification(populated) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to accept notification action", error: error.message });
  }
});

router.post("/:notificationId/decline", async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      receiverId: req.user.id
    })
      .populate("senderId", "username displayName avatarUrl avatarColor")
      .populate("roomId", "name");

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (notification.type === "FOLLOW_REQUEST" && notification.requestId) {
      await FollowRequest.findOneAndUpdate(
        { _id: notification.requestId, receiverId: req.user.id, status: "pending" },
        { $set: { status: "declined", respondedAt: new Date() } }
      );
    }

    if (notification.type === "JOIN_ROOM_REQUEST" && notification.requestId) {
      const request = await RoomJoinRequest.findById(notification.requestId);
      if (request && request.status === "pending") {
        const room = await ChatRoom.findById(request.roomId);
        const isAdmin = room && (room.createdBy.toString() === req.user.id || (room.admins || []).some((adminId) => adminId.toString() === req.user.id));
        if (isAdmin) {
          request.status = "declined";
          request.reviewedBy = req.user.id;
          request.reviewedAt = new Date();
          await request.save();
        }
      }
    }

    notification.isRead = true;
    await notification.save();

    return res.json({ ok: true, notification: serializeNotification(notification) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to decline notification action", error: error.message });
  }
});

module.exports = router;
