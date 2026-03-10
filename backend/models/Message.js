const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    duration: { type: Number, min: 0 },
    transcript: { type: String, trim: true, maxlength: 4000, default: "" },
    transcriptLanguage: { type: String, trim: true, maxlength: 32, default: "" },
    transcriptGeneratedAt: { type: Date }
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true, maxlength: 16 },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { _id: false }
);

const replyToSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    username: { type: String, required: true, maxlength: 80 },
    snippet: { type: String, required: true, maxlength: 220 }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, trim: true, maxlength: 1000, default: "" },
    attachments: [attachmentSchema],
    replyTo: replyToSchema,
    reactions: [reactionSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
