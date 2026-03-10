const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const User = require("../models/User");
const ChatRoom = require("../models/ChatRoom");
const Report = require("../models/Report");
const FollowRequest = require("../models/FollowRequest");
const auth = require("../middleware/auth");
const { createNotification } = require("../utils/notifications");
const { uploadBuffer, cloudinaryEnabled } = require("../utils/cloudinary");
const pkg = require("../package.json");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }
});

const usernameRegex = /^[a-zA-Z0-9_.-]{3,30}$/;
const avatarUploadDir = path.join(__dirname, "..", "uploads", "avatars");

const ensureAvatarDir = () => {
  if (!fs.existsSync(avatarUploadDir)) {
    fs.mkdirSync(avatarUploadDir, { recursive: true });
  }
};

const saveAvatarLocally = (file, userId) => {
  ensureAvatarDir();
  const extFromMime = file.mimetype?.split("/")?.[1] || "png";
  const safeExt = extFromMime.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "png";
  const fileName = `avatar-${userId}-${Date.now()}.${safeExt}`;
  const filePath = path.join(avatarUploadDir, fileName);
  fs.writeFileSync(filePath, file.buffer);
  return `/uploads/avatars/${fileName}`;
};

const normalizeFilters = (value = {}) => ({
  waves: Array.isArray(value.waves) ? value.waves.map((item) => String(item).trim()).filter(Boolean).slice(0, 10) : [],
  people: Array.isArray(value.people) ? value.people.map((item) => String(item).trim()).filter(Boolean).slice(0, 10) : [],
  topics: Array.isArray(value.topics) ? value.topics.map((item) => String(item).trim()).filter(Boolean).slice(0, 10) : []
});

const emitUserUpdate = async (io, userId, payload = {}) => {
  if (!io) return;
  const rooms = await ChatRoom.find({ members: userId }).select("_id");
  rooms.forEach((room) => {
    io.to(room._id.toString()).emit("user:updated", { userId, ...payload });
  });
};

const canViewerSeeUser = (user, viewerId) => {
  if (!user || !viewerId) return false;
  const visibility = user.preferences?.visibility || "friends";
  if (user._id.toString() === viewerId) return true;
  if (visibility === "public") return true;
  if (visibility === "invisible") return false;
  const followerIds = (user.followers || []).map((id) => id.toString());
  const followingIds = (user.following || []).map((id) => id.toString());
  const isFriend = followerIds.includes(viewerId) && followingIds.includes(viewerId);
  return isFriend;
};

const serializeUser = (user, viewerId) => {
  const canSee = canViewerSeeUser(user, viewerId);
  return {
    id: user._id,
    username: user.username,
    displayName: canSee ? user.displayName || user.username : "Hidden",
    email: user.email,
    avatarUrl: canSee ? user.avatarUrl : null,
    avatarColor: user.avatarColor,
    bio: canSee ? user.bio : null,
    status: canSee ? user.status : null,
    presenceStatus: user.presenceStatus || "offline",
    lastSeen: user.lastSeen || null,
    preferences: user.preferences,
    followersCount: user.followers?.length || 0,
    followingCount: user.following?.length || 0,
    visibility: user.preferences?.visibility || "friends"
  };
};

router.use(auth);

router.get("/me", async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ user: serializeUser(user, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile", error: error.message });
  }
});

router.patch("/me/profile", upload.single("avatar"), async (req, res) => {
  try {
    const { displayName, bio } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (displayName !== undefined) {
      const trimmed = displayName.trim();
      if (trimmed.length < 2 || trimmed.length > 50) {
        return res.status(400).json({ message: "Display name must be 2-50 characters" });
      }
      user.displayName = trimmed;
    }

    if (bio !== undefined) {
      const trimmedBio = bio.trim();
      if (trimmedBio.length > 240) {
        return res.status(400).json({ message: "Bio cannot exceed 240 characters" });
      }
      user.bio = trimmedBio;
    }

    if (req.file) {
      if (!req.file.mimetype?.startsWith("image/")) {
        return res.status(400).json({ message: "Avatar must be an image file" });
      }
      if (cloudinaryEnabled) {
        const uploadResult = await uploadBuffer(req.file.buffer, {
          folder: "wavvy/avatars",
          transformation: [{ width: 400, height: 400, crop: "fill", gravity: "auto" }]
        });
        user.avatarUrl = uploadResult.secure_url || uploadResult.url;
      } else {
        user.avatarUrl = saveAvatarLocally(req.file, req.user.id);
      }
    }

    await user.save();

    const io = req.app.get("io");
    emitUserUpdate(io, req.user.id, { profile: serializeUser(user, req.user.id) }).catch(() => undefined);

    return res.json({ user: serializeUser(user, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
});

router.patch("/me/username", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !usernameRegex.test(username.trim())) {
      return res.status(400).json({ message: "Username must be 3-30 characters and can include letters, numbers, dot, dash, underscore." });
    }
    const normalized = username.trim();
    const existing = await User.findOne({
      username: { $regex: new RegExp(`^${normalized}$`, "i") },
      _id: { $ne: req.user.id }
    });
    if (existing) {
      return res.status(409).json({ message: "Username is already taken" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { username: normalized } },
      { new: true }
    );

    const io = req.app.get("io");
    emitUserUpdate(io, req.user.id, { profile: serializeUser(user, req.user.id) }).catch(() => undefined);

    return res.json({ user: serializeUser(user, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update username", error: error.message });
  }
});

router.patch("/me/status", async (req, res) => {
  try {
    const { text, emoji } = req.body;
    const trimmedText = text ? text.toString().trim() : "";
    const trimmedEmoji = emoji ? emoji.toString().trim() : "";
    if (trimmedText.length > 64) {
      return res.status(400).json({ message: "Status text too long" });
    }
    if (trimmedEmoji.length > 4) {
      return res.status(400).json({ message: "Emoji is too long" });
    }

    const statusPayload = {};
    if (trimmedText) statusPayload.text = trimmedText;
    if (trimmedEmoji) statusPayload.emoji = trimmedEmoji;
    statusPayload.updatedAt = new Date();

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { status: statusPayload } },
      { new: true }
    );

    const io = req.app.get("io");
    emitUserUpdate(io, req.user.id, { status: statusPayload }).catch(() => undefined);

    return res.json({ user: serializeUser(user, req.user.id) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update status", error: error.message });
  }
});

router.get("/me/preferences", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("preferences");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ preferences: user.preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load preferences", error: error.message });
  }
});

router.patch("/me/preferences", async (req, res) => {
  try {
    const updates = {};
    const prefs = req.body || {};

    if (prefs.notifications) {
      updates["preferences.notifications"] = {
        mentions: Boolean(prefs.notifications.mentions),
        invites: Boolean(prefs.notifications.invites),
        waveAlerts: Boolean(prefs.notifications.waveAlerts)
      };
    }

    if (prefs.device) {
      updates["preferences.device"] = {
        sounds: Boolean(prefs.device.sounds),
        haptics: Boolean(prefs.device.haptics)
      };
    }

    if (prefs.language) {
      const lang = prefs.language === "fr" ? "fr" : "en";
      updates["preferences.language"] = lang;
    }

    if (prefs.analytics !== undefined) {
      updates["preferences.analytics"] = Boolean(prefs.analytics);
    }

    if (prefs.visibility) {
      const allowed = ["public", "friends", "invisible"];
      if (!allowed.includes(prefs.visibility)) {
        return res.status(400).json({ message: "Invalid visibility option" });
      }
      updates["preferences.visibility"] = prefs.visibility;
    }

    if (prefs.discoverFilters) {
      updates["preferences.discoverFilters"] = normalizeFilters(prefs.discoverFilters);
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true }
    );

    const io = req.app.get("io");
    emitUserUpdate(io, req.user.id, { preferences: user.preferences }).catch(() => undefined);

    return res.json({ preferences: user.preferences });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update preferences", error: error.message });
  }
});

router.get("/blocked", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("blockedUsers", "username displayName avatarUrl avatarColor");
    return res.json({
      blocked: (user.blockedUsers || []).map((entry) => serializeUser(entry, req.user.id))
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load blocked list", error: error.message });
  }
});

router.post("/blocked/:userId", async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.user.id) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { blockedUsers: targetId }, $pull: { followers: targetId, following: targetId } },
      { new: true }
    );

    return res.json({ blocked: user.blockedUsers.map((id) => id.toString()) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to block user", error: error.message });
  }
});

router.delete("/blocked/:userId", async (req, res) => {
  try {
    const targetId = req.params.userId;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { blockedUsers: targetId } },
      { new: true }
    );
    return res.json({ blocked: user.blockedUsers.map((id) => id.toString()) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to unblock user", error: error.message });
  }
});

router.get("/followers", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("followers", "username displayName avatarUrl avatarColor preferences followers following blockedUsers");
    const followers = (user.followers || []).filter((entry) => canViewerSeeUser(entry, req.user.id)).map((entry) => serializeUser(entry, req.user.id));
    return res.json({ followers });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load followers", error: error.message });
  }
});

router.get("/following", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("following", "username displayName avatarUrl avatarColor preferences followers following blockedUsers");
    const following = (user.following || []).filter((entry) => canViewerSeeUser(entry, req.user.id)).map((entry) => serializeUser(entry, req.user.id));
    return res.json({ following });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load following", error: error.message });
  }
});

router.post("/follow/:userId", async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.user.id) {
      return res.status(400).json({ message: "You cannot follow yourself" });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    // If target blocked current user, disallow.
    if ((target.blockedUsers || []).map((id) => id.toString()).includes(req.user.id)) {
      return res.status(403).json({ message: "You cannot follow this user" });
    }

    const alreadyFollowing = (target.followers || []).some((id) => id.toString() === req.user.id);
    if (alreadyFollowing) {
      return res.json({ ok: true, alreadyFollowing: true });
    }

    const visibility = target.preferences?.visibility || "friends";
    const io = req.app.get("io");
    const sender = await User.findById(req.user.id).select("username displayName");
    const senderName = sender?.displayName || sender?.username || "Someone";

    if (visibility === "public") {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { following: targetId } });
      await User.findByIdAndUpdate(targetId, { $addToSet: { followers: req.user.id } });
      await createNotification(
        {
          type: "NEW_FOLLOWER",
          senderId: req.user.id,
          receiverId: targetId,
          message: `${senderName} started following you`
        },
        io
      );
      return res.json({ ok: true, following: true });
    }

    const existingRequest = await FollowRequest.findOne({
      senderId: req.user.id,
      receiverId: targetId,
      status: "pending"
    });
    if (existingRequest) {
      return res.json({ ok: true, requested: true, requestId: existingRequest._id.toString() });
    }

    const request = await FollowRequest.create({
      senderId: req.user.id,
      receiverId: targetId
    });

    await createNotification(
      {
        type: "FOLLOW_REQUEST",
        senderId: req.user.id,
        receiverId: targetId,
        requestId: request._id,
        message: `${senderName} sent you a follow request`
      },
      io
    );

    return res.json({ ok: true, requested: true, requestId: request._id.toString() });
  } catch (error) {
    return res.status(500).json({ message: "Failed to follow user", error: error.message });
  }
});

router.delete("/follow/:userId", async (req, res) => {
  try {
    const targetId = req.params.userId;
    await User.findByIdAndUpdate(req.user.id, { $pull: { following: targetId } });
    await User.findByIdAndUpdate(targetId, { $pull: { followers: req.user.id } });
    await FollowRequest.updateMany(
      {
        $or: [
          { senderId: req.user.id, receiverId: targetId },
          { senderId: targetId, receiverId: req.user.id }
        ],
        status: "pending"
      },
      { $set: { status: "declined", respondedAt: new Date() } }
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "Failed to unfollow user", error: error.message });
  }
});

router.get("/rooms", async (req, res) => {
  try {
    const rooms = await ChatRoom.find({
      $or: [{ createdBy: req.user.id }, { members: req.user.id }]
    })
      .populate("createdBy admins members", "username avatarColor displayName avatarUrl")
      .sort({ updatedAt: -1 });
    return res.json({ rooms });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load rooms", error: error.message });
  }
});

router.post("/report", async (req, res) => {
  try {
    const { category, description } = req.body;
    if (!category || !["bug", "abuse", "other"].includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }
    if (!description || description.trim().length < 4) {
      return res.status(400).json({ message: "Description is required" });
    }
    await Report.create({
      user: req.user.id,
      category,
      description: description.trim().slice(0, 500),
      userAgent: req.headers["user-agent"],
      platform: req.headers["sec-ch-ua-platform"]
    });
    return res.status(201).json({ message: "Report submitted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to submit report", error: error.message });
  }
});

router.get("/profile/:userId", async (req, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    const blockedYou = (target.blockedUsers || []).map((id) => id.toString()).includes(req.user.id);
    if (blockedYou) {
      return res.status(403).json({ message: "You are blocked by this user" });
    }

    const roomsCount = await ChatRoom.countDocuments({ members: target._id });
    const viewer = await User.findById(req.user.id).select("following");
    const isFollowing = (viewer?.following || []).some((id) => id.toString() === target._id.toString());
    const pendingFollowRequest = await FollowRequest.findOne({
      senderId: req.user.id,
      receiverId: target._id,
      status: "pending"
    }).select("_id");

    const visibility = target.preferences?.visibility || "friends";
    const canViewDetails = canViewerSeeUser(target, req.user.id);
    return res.json({
      user: {
        id: target._id.toString(),
        username: target.username,
        displayName: target.displayName || target.username,
        avatarUrl: target.avatarUrl,
        avatarColor: target.avatarColor,
        bio: canViewDetails ? target.bio || "" : "",
        isPrivate: visibility !== "public",
        visibility,
        canViewDetails,
        presenceStatus: target.presenceStatus || "offline",
        lastSeen: target.lastSeen || null
      },
      stats: {
        followers: target.followers?.length || 0,
        following: target.following?.length || 0,
        rooms: roomsCount
      },
      relationship: {
        isSelf: target._id.toString() === req.user.id,
        isFollowing,
        hasPendingFollowRequest: Boolean(pendingFollowRequest)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
});

router.get("/about", (_req, res) => {
  return res.json({ version: pkg.version, name: pkg.name });
});

module.exports = router;
