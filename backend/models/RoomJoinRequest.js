const mongoose = require("mongoose");

const roomJoinRequestSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true, index: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending"
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date }
  },
  { timestamps: true }
);

roomJoinRequestSchema.index({ roomId: 1, requesterId: 1, status: 1 });

module.exports = mongoose.model("RoomJoinRequest", roomJoinRequestSchema);
