const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 200, default: "" },
    avatarUrl: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isPrivate: { type: Boolean, default: false },
    roomType: { type: String, enum: ["normal", "direct"], default: "normal" }
  },
  { timestamps: true }
);

chatRoomSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("ChatRoom", chatRoomSchema);
