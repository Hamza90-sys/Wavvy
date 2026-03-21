require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const { repairDirectRooms } = require("../utils/directRoomMaintenance");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const summary = await repairDirectRooms({ logger: console });
    console.log("[direct-room-repair] done", summary);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error("[direct-room-repair] error:", error.message);
  process.exitCode = 1;
});

