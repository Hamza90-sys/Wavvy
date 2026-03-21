require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");
const chatRoomRoutes = require("./routes/chatRooms");
const messageRoutes = require("./routes/messages");
const userRoutes = require("./routes/users");
const notificationRoutes = require("./routes/notifications");
const ChatRoom = require("./models/ChatRoom");
const Message = require("./models/Message");
const User = require("./models/User");
const { repairDirectRooms } = require("./utils/directRoomMaintenance");
const {
  sanitizeRequestInput,
  globalApiLimiter,
  authLimiter,
  writeApiLimiter,
  uploadLimiter
} = require("./middleware/security");

mongoose.set("bufferCommands", false);

const app = express();
const server = http.createServer(app);
const userSockets = new Map();
const voiceRooms = new Map();
const socketEventState = new Map();

// allow the frontend origin(s) to be configured via env var
// `FRONTEND_URL` can be a single value or a comma-separated list
const rawFrontends = process.env.FRONTEND_URL || "http://localhost:3000";
const allowedOrigins = rawFrontends.split(",").map((u) => u.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});
app.set("io", io);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.disable("x-powered-by");
if ((process.env.TRUST_PROXY || "").toLowerCase() === "true") {
  app.set("trust proxy", 1);
}
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
app.use(sanitizeRequestInput);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (_req, res) => {
  res.json({ message: "Wavvy API is running" });
});

app.use("/api", (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "Database unavailable. Check the MongoDB connection or Atlas IP whitelist."
    });
  }
  next();
});

app.use("/api", globalApiLimiter);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/chatrooms", writeApiLimiter, chatRoomRoutes);
app.use("/api/messages/upload", uploadLimiter);
app.use("/api/messages", writeApiLimiter, messageRoutes);
app.use("/api/users", writeApiLimiter, userRoutes);
app.use("/api/notifications", writeApiLimiter, notificationRoutes);

const serializeMessage = (messageDoc) => ({
  _id: messageDoc._id,
  room: messageDoc.room?._id || messageDoc.room,
  content: messageDoc.content,
  attachments: (messageDoc.attachments || []).map((item) => ({
    url: item.url,
    fileName: item.fileName,
    mimeType: item.mimeType,
    size: item.size,
    duration: item.duration,
    transcript: item.transcript || "",
    transcriptLanguage: item.transcriptLanguage || "",
    transcriptGeneratedAt: item.transcriptGeneratedAt || null
  })),
  reactions: (messageDoc.reactions || []).map((reaction) => ({
    emoji: reaction.emoji,
    users: (reaction.users || []).map((user) => ({
      id: user._id?.toString?.() || user.toString(),
      username: user.username
    }))
  })),
  user: messageDoc.user
    ? {
        id: messageDoc.user._id?.toString?.() || messageDoc.user.id || messageDoc.user,
        username: messageDoc.user.username,
        displayName: messageDoc.user.displayName || messageDoc.user.username,
        avatarColor: messageDoc.user.avatarColor,
        avatarUrl: messageDoc.user.avatarUrl,
        status: messageDoc.user.status
      }
    : null,
  createdAt: messageDoc.createdAt
});

const serializeVoiceParticipant = (userId, entry) => ({
  userId,
  username: entry.username,
  displayName: entry.displayName,
  avatarUrl: entry.avatarUrl,
  avatarColor: entry.avatarColor,
  muted: Boolean(entry.muted)
});

const getVoiceRoomParticipants = (roomId) => {
  const roomState = voiceRooms.get(roomId);
  if (!roomState) return [];
  return Array.from(roomState.entries()).map(([userId, entry]) => serializeVoiceParticipant(userId, entry));
};

const emitVoiceParticipants = (roomId) => {
  io.to(`voice:${roomId}`).emit("voice:participants", {
    roomId,
    participants: getVoiceRoomParticipants(roomId)
  });
};

const setPresenceState = async (userId, presenceStatus) => {
  const update = { presenceStatus };
  if (presenceStatus === "offline") {
    update.lastSeen = new Date();
  }
  return User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true }
  ).select("_id presenceStatus lastSeen");
};

const emitRoomUsers = async (roomId) => {
  const room = await ChatRoom.findById(roomId).populate("members", "_id username displayName avatarUrl avatarColor status presenceStatus lastSeen preferences.visibility followers following blockedUsers");
  if (!room) return;

  io.to(roomId).emit("roomUsers", {
    roomId,
    users: room.members.map((member) => ({
      id: member._id,
      username: member.username,
      displayName: member.displayName || member.username,
      avatarUrl: member.avatarUrl,
      avatarColor: member.avatarColor,
      status: member.status,
      presenceStatus: userSockets.has(member._id.toString()) ? "online" : member.presenceStatus || "offline",
      lastSeen: member.lastSeen || null,
      visibility: member.preferences?.visibility || "friends",
      online: userSockets.has(member._id.toString())
    }))
  });
};

const emitPresenceForUser = async (userId, presenceDoc) => {
  const presencePayload = {
    userId,
    presenceStatus: presenceDoc?.presenceStatus || (userSockets.has(userId) ? "online" : "offline"),
    lastSeen: presenceDoc?.lastSeen || null
  };
  io.emit("presence:update", presencePayload);
  const rooms = await ChatRoom.find({ members: userId }).select("_id");
  await Promise.all(rooms.map((room) => emitRoomUsers(room._id.toString())));
};

const isMemberOfRoom = async (roomId, userId) => {
  if (!roomId || !userId) return false;
  const room = await ChatRoom.findById(roomId).select("_id members");
  if (!room) return false;
  return room.members.some((memberId) => memberId.toString() === userId);
};

const cleanupVoiceRoomForSocket = (socket) => {
  const roomId = socket.voiceRoomId;
  if (!roomId) return;

  socket.leave(`voice:${roomId}`);
  const roomState = voiceRooms.get(roomId);
  if (roomState) {
    const participant = roomState.get(socket.user.id);
    if (participant) {
      participant.socketIds.delete(socket.id);
      if (!participant.socketIds.size) {
        roomState.delete(socket.user.id);
        socket.to(`voice:${roomId}`).emit("voice:user-left", {
          roomId,
          userId: socket.user.id
        });
      }
    }
    if (!roomState.size) {
      voiceRooms.delete(roomId);
    } else {
      emitVoiceParticipants(roomId);
    }
  }

  socket.voiceRoomId = null;
};

const allowSocketEvent = (socket, eventName, maxEvents, windowMs) => {
  const now = Date.now();
  const key = `${socket.id}:${eventName}`;
  const entry = socketEventState.get(key);
  if (!entry || now > entry.resetAt) {
    socketEventState.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxEvents) return false;
  entry.count += 1;
  return true;
};

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("_id username email avatarColor displayName avatarUrl status presenceStatus lastSeen preferences blockedUsers followers following");
    if (!user) {
      return next(new Error("Unauthorized"));
    }

    socket.user = {
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      status: user.status,
      presenceStatus: user.presenceStatus || "offline",
      lastSeen: user.lastSeen || null
    };

    const currentSockets = userSockets.get(socket.user.id) || new Set();
    socket.wasOnline = currentSockets.size > 0;
    currentSockets.add(socket.id);
    userSockets.set(socket.user.id, currentSockets);

    next();
  } catch (error) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.user.id}`);
  if (!socket.wasOnline) {
    setPresenceState(socket.user.id, "online")
      .then((presenceDoc) => emitPresenceForUser(socket.user.id, presenceDoc))
      .catch(() => undefined);
  }

  socket.on("joinRoom", async ({ roomId }) => {
    if (!allowSocketEvent(socket, "joinRoom", 30, 10_000)) return;
    if (!roomId) return;

    const room = await ChatRoom.findById(roomId).select("_id members");
    if (!room) return;
    const isMember = room.members.some((memberId) => memberId.toString() === socket.user.id);
    if (!isMember) return;

    if (socket.currentRoom && socket.currentRoom !== roomId) {
      socket.leave(socket.currentRoom);
      await emitRoomUsers(socket.currentRoom);
    }

    socket.join(roomId);
    socket.currentRoom = roomId;
    await emitRoomUsers(roomId);
  });

  socket.on("leaveRoom", async ({ roomId }) => {
    if (!allowSocketEvent(socket, "leaveRoom", 30, 10_000)) return;
    if (!roomId) return;

    socket.to(roomId).emit("typing:stop", {
      roomId,
      userId: socket.user.id
    });
    socket.leave(roomId);
    if (socket.currentRoom === roomId) {
      socket.currentRoom = null;
    }

    await emitRoomUsers(roomId);
  });

  socket.on("sendMessage", async ({ roomId, content, attachments = [] }) => {
    if (!allowSocketEvent(socket, "sendMessage", 20, 10_000)) return;
    const text = (content || "").trim();
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    if (!roomId || (!text && !safeAttachments.length)) return;

    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    const isMember = room.members.some((memberId) => memberId.toString() === socket.user.id);
    if (!isMember) return;

    const blockedBy = await User.findOne({ _id: { $in: room.members }, blockedUsers: socket.user.id }).select("_id");
    if (blockedBy) {
      return;
    }

    const message = await Message.create({
      room: roomId,
      user: socket.user.id,
      content: text,
      attachments: safeAttachments
        .filter((item) => item?.url && item?.fileName && item?.mimeType)
        .slice(0, 5)
        .map((item) => ({
          url: item.url,
          fileName: item.fileName,
          mimeType: item.mimeType,
          size: item.size,
          duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : undefined,
          transcript: typeof item.transcript === "string" ? item.transcript.trim() : "",
          transcriptLanguage: typeof item.transcriptLanguage === "string" ? item.transcriptLanguage.trim() : "",
          transcriptGeneratedAt: item.transcript ? new Date() : null
        }))
    });

    const populatedMessage = await message.populate([
      { path: "user", select: "username displayName avatarColor avatarUrl status" },
      { path: "reactions.users", select: "username" }
    ]);

    socket.to(roomId).emit("typing:stop", {
      roomId,
      userId: socket.user.id
    });
    io.to(roomId).emit("newMessage", serializeMessage(populatedMessage));
  });

  socket.on("typing:start", async ({ roomId }) => {
    if (!allowSocketEvent(socket, "typing:start", 50, 10_000)) return;
    if (!roomId) return;
    const isMember = await isMemberOfRoom(roomId, socket.user.id);
    if (!isMember) return;

    socket.to(roomId).emit("typing:start", {
      roomId,
      userId: socket.user.id,
      username: socket.user.displayName || socket.user.username
    });
  });

  socket.on("typing:stop", async ({ roomId }) => {
    if (!allowSocketEvent(socket, "typing:stop", 50, 10_000)) return;
    if (!roomId) return;
    const isMember = await isMemberOfRoom(roomId, socket.user.id);
    if (!isMember) return;

    socket.to(roomId).emit("typing:stop", {
      roomId,
      userId: socket.user.id
    });
  });

  socket.on("toggleReaction", async ({ roomId, messageId, emoji }, ack) => {
    if (!allowSocketEvent(socket, "toggleReaction", 40, 10_000)) {
      if (typeof ack === "function") ack({ ok: false, message: "Too many reaction requests. Please slow down." });
      return;
    }
    const done = (payload) => {
      if (typeof ack === "function") ack(payload);
    };

    try {
      if (!roomId || !messageId || !emoji) {
        done({ ok: false, message: "Missing reaction payload." });
        return;
      }

      const room = await ChatRoom.findById(roomId);
      if (!room) {
        done({ ok: false, message: "Room not found." });
        return;
      }

      const isMember = room.members.some((memberId) => memberId.toString() === socket.user.id);
      if (!isMember) {
        done({ ok: false, message: "You are not a member of this room." });
        return;
      }

      const message = await Message.findOne({ _id: messageId, room: roomId });
      if (!message) {
        done({ ok: false, message: "Message not found." });
        return;
      }

      const reaction = message.reactions.find((entry) => entry.emoji === emoji);
      if (!reaction) {
        message.reactions.push({ emoji, users: [socket.user.id] });
      } else {
        const currentIndex = reaction.users.findIndex((userId) => userId.toString() === socket.user.id);
        if (currentIndex >= 0) {
          reaction.users.splice(currentIndex, 1);
        } else {
          reaction.users.push(socket.user.id);
        }
        if (!reaction.users.length) {
          message.reactions = message.reactions.filter((entry) => entry.emoji !== emoji);
        }
      }

      await message.save();
      const updated = await Message.findById(message._id).populate("reactions.users", "username");
      const normalizedReactions = (updated?.reactions || []).map((entry) => ({
        emoji: entry.emoji,
        users: (entry.users || []).map((user) => ({
          id: user._id?.toString?.() || user.toString(),
          username: user.username
        }))
      }));

      io.to(roomId).emit("messageReactionUpdated", {
        roomId,
        messageId,
        reactions: normalizedReactions
      });
      done({ ok: true, roomId, messageId, reactions: normalizedReactions });
    } catch (_error) {
      done({ ok: false, message: "Unable to update reaction." });
    }
  });

  socket.on("deleteMessage", async ({ roomId, messageId }, ack) => {
    if (!allowSocketEvent(socket, "deleteMessage", 20, 10_000)) {
      if (typeof ack === "function") ack({ ok: false, message: "Too many delete requests. Please slow down." });
      return;
    }
    const done = (payload) => {
      if (typeof ack === "function") ack(payload);
    };

    try {
      if (!roomId || !messageId) {
        done({ ok: false, message: "Missing room or message id." });
        return;
      }

      const room = await ChatRoom.findById(roomId).select("_id members createdBy admins");
      if (!room) {
        done({ ok: false, message: "Room not found." });
        return;
      }
      const isMember = room.members.some((memberId) => memberId.toString() === socket.user.id);
      if (!isMember) {
        done({ ok: false, message: "You are not a member of this room." });
        return;
      }

      const message = await Message.findOne({ _id: messageId, room: roomId }).select("_id user");
      if (!message) {
        done({ ok: false, message: "Message not found." });
        return;
      }

      const isOwner = message.user?.toString() === socket.user.id;
      const isAdmin = room.createdBy?.toString() === socket.user.id || room.admins?.some((adminId) => adminId.toString() === socket.user.id);
      if (!isOwner && !isAdmin) {
        done({ ok: false, message: "You can only delete your own messages." });
        return;
      }

      await Message.deleteOne({ _id: messageId, room: roomId });
      io.to(roomId).emit("messageDeleted", { roomId, messageId });
      done({ ok: true, messageId });
    } catch (error) {
      done({ ok: false, message: "Delete failed. Please try again." });
    }
  });

  socket.on("editMessage", async ({ roomId, messageId, newContent }, ack) => {
    if (!allowSocketEvent(socket, "editMessage", 30, 10_000)) {
      if (typeof ack === "function") ack({ ok: false, message: "Too many edit requests. Please slow down." });
      return;
    }
    const done = (payload) => {
      if (typeof ack === "function") ack(payload);
    };

    try {
      if (!roomId || !messageId) {
        done({ ok: false, message: "Missing room or message id." });
        return;
      }
      
      const text = (newContent || "").trim();
      if (!text) {
        done({ ok: false, message: "Message content cannot be empty." });
        return;
      }

      const room = await ChatRoom.findById(roomId).select("_id members");
      if (!room) {
        done({ ok: false, message: "Room not found." });
        return;
      }
      const isMember = room.members.some((memberId) => memberId.toString() === socket.user.id);
      if (!isMember) {
        done({ ok: false, message: "You are not a member of this room." });
        return;
      }

      const message = await Message.findOne({ _id: messageId, room: roomId }).select("_id user");
      if (!message) {
        done({ ok: false, message: "Message not found." });
        return;
      }

      // Only the author can edit their message
      const isOwner = message.user?.toString() === socket.user.id;
      if (!isOwner) {
        done({ ok: false, message: "You can only edit your own messages." });
        return;
      }

      // Update the message in DB
      await Message.updateOne(
        { _id: messageId, room: roomId },
        { $set: { content: text, isEdited: true } }
      );
      
      // Fetch the updated message and populate safely to broadcast
      const updatedMessage = await Message.findById(messageId).populate([
        { path: "user", select: "username displayName avatarColor avatarUrl status" },
        { path: "reactions.users", select: "username" }
      ]);
      
      const serializedMessage = serializeMessage(updatedMessage);
      serializedMessage.isEdited = true;

      io.to(roomId).emit("messageEdited", {
        roomId,
        messageId,
        message: serializedMessage
      });
      
      done({ ok: true, messageId, message: serializedMessage });
    } catch (error) {
      done({ ok: false, message: "Edit failed. Please try again." });
    }
  });

  socket.on("call:invite", async ({ roomId, targetUserId, callType }) => {
    if (!allowSocketEvent(socket, "call:invite", 12, 10_000)) return;
    if (!roomId || !targetUserId || !callType) return;

    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    const isCallerInRoom = room.members.some((memberId) => memberId.toString() === socket.user.id);
    const isTargetInRoom = room.members.some((memberId) => memberId.toString() === targetUserId);
    if (!isCallerInRoom || !isTargetInRoom) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;

    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:invite", {
        roomId,
        callType,
        from: {
          id: socket.user.id,
          username: socket.user.username
        }
      });
    });
  });

  socket.on("call:accept", ({ roomId, targetUserId, callType }) => {
    if (!roomId || !targetUserId || !callType) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:accepted", {
        roomId,
        callType,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("call:reject", ({ roomId, targetUserId }) => {
    if (!roomId || !targetUserId) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:rejected", {
        roomId,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("call:offer", ({ roomId, targetUserId, offer, callType }) => {
    if (!roomId || !targetUserId || !offer || !callType) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:offer", {
        roomId,
        callType,
        offer,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("call:answer", ({ roomId, targetUserId, answer }) => {
    if (!roomId || !targetUserId || !answer) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:answer", {
        roomId,
        answer,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("call:ice-candidate", ({ roomId, targetUserId, candidate }) => {
    if (!roomId || !targetUserId || !candidate) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:ice-candidate", {
        roomId,
        candidate,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("call:end", ({ roomId, targetUserId }) => {
    if (!roomId || !targetUserId) return;

    const sockets = userSockets.get(targetUserId);
    if (!sockets || !sockets.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("call:ended", {
        roomId,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("voice:join", async ({ roomId }) => {
    if (!allowSocketEvent(socket, "voice:join", 20, 10_000)) return;
    if (!roomId) return;
    const isMember = await isMemberOfRoom(roomId, socket.user.id);
    if (!isMember) return;

    if (socket.voiceRoomId && socket.voiceRoomId !== roomId) {
      cleanupVoiceRoomForSocket(socket);
    }

    socket.join(`voice:${roomId}`);
    socket.voiceRoomId = roomId;

    let roomState = voiceRooms.get(roomId);
    if (!roomState) {
      roomState = new Map();
      voiceRooms.set(roomId, roomState);
    }

    let participant = roomState.get(socket.user.id);
    const isNewParticipant = !participant;
    if (!participant) {
      participant = {
        username: socket.user.username,
        displayName: socket.user.displayName,
        avatarUrl: socket.user.avatarUrl,
        avatarColor: socket.user.avatarColor,
        muted: false,
        socketIds: new Set()
      };
      roomState.set(socket.user.id, participant);
    }
    participant.socketIds.add(socket.id);

    if (isNewParticipant) {
      socket.to(`voice:${roomId}`).emit("voice:user-joined", {
        roomId,
        participant: serializeVoiceParticipant(socket.user.id, participant)
      });
    }
    emitVoiceParticipants(roomId);
  });

  socket.on("voice:leave", () => {
    cleanupVoiceRoomForSocket(socket);
  });

  socket.on("voice:mute", ({ roomId, muted }) => {
    const effectiveRoomId = roomId || socket.voiceRoomId;
    if (!effectiveRoomId) return;
    const roomState = voiceRooms.get(effectiveRoomId);
    const participant = roomState?.get(socket.user.id);
    if (!participant) return;

    participant.muted = Boolean(muted);
    emitVoiceParticipants(effectiveRoomId);
  });

  socket.on("voice:offer", ({ roomId, targetUserId, offer }) => {
    if (!roomId || !targetUserId || !offer) return;
    const sockets = userSockets.get(targetUserId);
    if (!sockets?.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("voice:offer", {
        roomId,
        offer,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("voice:answer", ({ roomId, targetUserId, answer }) => {
    if (!roomId || !targetUserId || !answer) return;
    const sockets = userSockets.get(targetUserId);
    if (!sockets?.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("voice:answer", {
        roomId,
        answer,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("voice:ice-candidate", ({ roomId, targetUserId, candidate }) => {
    if (!roomId || !targetUserId || !candidate) return;
    const sockets = userSockets.get(targetUserId);
    if (!sockets?.size) return;
    sockets.forEach((socketId) => {
      io.to(socketId).emit("voice:ice-candidate", {
        roomId,
        candidate,
        fromUserId: socket.user.id
      });
    });
  });

  socket.on("disconnect", async () => {
    if (socket.currentRoom) {
      socket.to(socket.currentRoom).emit("typing:stop", {
        roomId: socket.currentRoom,
        userId: socket.user.id
      });
    }
    cleanupVoiceRoomForSocket(socket);

    const sockets = userSockets.get(socket.user.id);
    let isNowOffline = false;
    if (sockets) {
      sockets.delete(socket.id);
      if (!sockets.size) {
        userSockets.delete(socket.user.id);
        isNowOffline = true;
      }
    }

    if (isNowOffline) {
      const presenceDoc = await setPresenceState(socket.user.id, "offline");
      await emitPresenceForUser(socket.user.id, presenceDoc);
    }

    for (const key of socketEventState.keys()) {
      if (key.startsWith(`${socket.id}:`)) {
        socketEventState.delete(key);
      }
    }
  });
});

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
  repairDirectRooms({ logger: console }).catch((error) => {
    console.error("[direct-room-repair] failed:", error.message);
  });
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error.message);
});

mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });
