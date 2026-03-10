const Notification = require("../models/Notification");

const toUserPayload = (user) => {
  if (!user) return null;
  return {
    id: user._id?.toString?.() || user.id?.toString?.() || user.toString(),
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || "",
    avatarColor: user.avatarColor || ""
  };
};

const serializeNotification = (notificationDoc) => ({
  id: notificationDoc._id.toString(),
  type: notificationDoc.type,
  senderId: notificationDoc.senderId?._id?.toString?.() || notificationDoc.senderId?.toString?.() || "",
  receiverId: notificationDoc.receiverId?._id?.toString?.() || notificationDoc.receiverId?.toString?.() || "",
  message: notificationDoc.message,
  createdAt: notificationDoc.createdAt,
  isRead: Boolean(notificationDoc.isRead),
  requestId: notificationDoc.requestId?.toString?.() || "",
  roomId: notificationDoc.roomId?._id?.toString?.() || notificationDoc.roomId?.toString?.() || "",
  roomName: notificationDoc.roomId?.name || "",
  sender: toUserPayload(notificationDoc.senderId)
});

const createNotification = async ({ type, senderId, receiverId, message, requestId, roomId }, io) => {
  const created = await Notification.create({
    type,
    senderId,
    receiverId,
    message,
    requestId: requestId || undefined,
    roomId: roomId || undefined
  });
  const full = await Notification.findById(created._id)
    .populate("senderId", "username displayName avatarUrl avatarColor")
    .populate("roomId", "name");
  const payload = serializeNotification(full);
  if (io) {
    io.to(`user:${payload.receiverId}`).emit("notification:new", payload);
  }
  return payload;
};

module.exports = {
  serializeNotification,
  createNotification
};
