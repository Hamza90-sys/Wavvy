const ChatRoom = require("../models/ChatRoom");
const Message = require("../models/Message");
const RoomJoinRequest = require("../models/RoomJoinRequest");

const isDmLikeRoom = (room) => {
  if (!room) return false;
  const name = (room.name || "").toString();
  return room.roomType === "direct" || (room.isPrivate && name.toLowerCase().startsWith("dm-"));
};

const uniqueStrings = (values = []) => {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const id = value?.toString?.();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

const rankRoomSpeakers = async (roomId) => {
  const rows = await Message.aggregate([
    { $match: { room: roomId } },
    {
      $group: {
        _id: "$user",
        count: { $sum: 1 },
        lastAt: { $max: "$createdAt" }
      }
    },
    { $sort: { count: -1, lastAt: -1 } }
  ]);
  return rows.map((row) => row?._id?.toString?.()).filter(Boolean);
};

const chooseDmPair = async (room) => {
  const memberIds = uniqueStrings(room.members || []);
  if (memberIds.length <= 2) return memberIds;

  const createdById = room.createdBy?.toString?.();
  const keep = [];

  if (createdById && memberIds.includes(createdById)) {
    keep.push(createdById);
  }

  const rankedSpeakers = await rankRoomSpeakers(room._id);
  rankedSpeakers.forEach((speakerId) => {
    if (keep.length >= 2) return;
    if (!memberIds.includes(speakerId)) return;
    if (keep.includes(speakerId)) return;
    keep.push(speakerId);
  });

  memberIds.forEach((memberId) => {
    if (keep.length >= 2) return;
    if (keep.includes(memberId)) return;
    keep.push(memberId);
  });

  return keep.slice(0, 2);
};

const repairDirectRooms = async ({ logger = console } = {}) => {
  const rooms = await ChatRoom.find({
    $or: [
      { roomType: "direct" },
      { isPrivate: true, name: { $regex: /^dm-/i } }
    ]
  }).select("_id name createdBy admins members isPrivate roomType");

  let scanned = 0;
  let changed = 0;
  let declinedJoinRequests = 0;

  for (const room of rooms) {
    scanned += 1;
    if (!isDmLikeRoom(room)) continue;

    const originalMembers = uniqueStrings(room.members || []);
    if (!originalMembers.length) continue;

    const keepPair = await chooseDmPair(room);
    const nextMembers = keepPair;
    const nextAdmins = uniqueStrings(room.admins || []).filter((id) => nextMembers.includes(id));
    const createdById = room.createdBy?.toString?.();
    const nextCreatedBy = nextMembers.includes(createdById) ? createdById : nextMembers[0];

    const needsUpdate =
      room.roomType !== "direct" ||
      room.isPrivate !== true ||
      originalMembers.length !== nextMembers.length ||
      uniqueStrings(room.admins || []).length !== nextAdmins.length ||
      nextCreatedBy !== createdById;

    if (needsUpdate) {
      await ChatRoom.updateOne(
        { _id: room._id },
        {
          $set: {
            roomType: "direct",
            isPrivate: true,
            createdBy: nextCreatedBy,
            members: nextMembers,
            admins: nextAdmins
          }
        }
      );
      changed += 1;
    }

    const declineResult = await RoomJoinRequest.updateMany(
      { roomId: room._id, status: "pending" },
      { $set: { status: "declined", reviewedAt: new Date() } }
    );
    declinedJoinRequests += declineResult.modifiedCount || 0;
  }

  logger.info(
    `[direct-room-repair] scanned=${scanned} changed=${changed} declinedJoinRequests=${declinedJoinRequests}`
  );

  return { scanned, changed, declinedJoinRequests };
};

module.exports = {
  repairDirectRooms
};

