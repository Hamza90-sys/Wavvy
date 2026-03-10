const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "FOLLOW_REQUEST",
        "FOLLOW_ACCEPTED",
        "JOIN_ROOM_REQUEST",
        "JOIN_ROOM_ACCEPTED",
        "NEW_FOLLOWER"
      ]
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom" },
    requestId: { type: mongoose.Schema.Types.ObjectId },
    message: { type: String, required: true, trim: true, maxlength: 280 },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

notificationSchema.index({ receiverId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
