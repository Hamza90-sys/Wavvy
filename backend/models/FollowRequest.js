const mongoose = require("mongoose");

const followRequestSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending"
    },
    respondedAt: { type: Date }
  },
  { timestamps: true }
);

followRequestSchema.index({ senderId: 1, receiverId: 1, status: 1 });

module.exports = mongoose.model("FollowRequest", followRequestSchema);
