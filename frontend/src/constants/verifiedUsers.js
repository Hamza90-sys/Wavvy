const FOUNDER_VERIFIED_IDS = new Set([
  "699c643a152370495ced6bff"
]);

const resolveUserId = (userLike) => {
  if (!userLike) return "";
  if (typeof userLike === "string") return userLike;
  return userLike.id || userLike._id || userLike.userId || "";
};

export const isVerifiedUser = (userLike) => {
  const userId = resolveUserId(userLike);
  return Boolean(userId) && FOUNDER_VERIFIED_IDS.has(userId);
};

