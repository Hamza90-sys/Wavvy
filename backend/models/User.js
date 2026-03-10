const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, minlength: 2, maxlength: 30, unique: true },
    displayName: { type: String, trim: true, maxlength: 50 },
    bio: { type: String, trim: true, maxlength: 240 },
    avatarUrl: { type: String, trim: true },
    status: {
      text: { type: String, trim: true, maxlength: 64 },
      emoji: { type: String, trim: true, maxlength: 4 },
      updatedAt: { type: Date }
    },
    presenceStatus: {
      type: String,
      enum: ["online", "offline"],
      default: "offline"
    },
    lastSeen: { type: Date },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    avatarColor: { type: String, default: "#34a0ff" },
    preferences: {
      notifications: {
        mentions: { type: Boolean, default: true },
        invites: { type: Boolean, default: true },
        waveAlerts: { type: Boolean, default: false }
      },
      device: {
        sounds: { type: Boolean, default: true },
        haptics: { type: Boolean, default: true }
      },
      language: { type: String, enum: ["en", "fr"], default: "en" },
      analytics: { type: Boolean, default: false },
      visibility: { type: String, enum: ["public", "friends", "invisible"], default: "friends" },
      discoverFilters: {
        waves: [{ type: String, trim: true }],
        people: [{ type: String, trim: true }],
        topics: [{ type: String, trim: true }]
      }
    },
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
