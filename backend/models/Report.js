const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, enum: ["bug", "abuse", "other"], required: true },
    description: { type: String, required: true, maxlength: 500 },
    userAgent: { type: String },
    platform: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
