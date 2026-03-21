const rateLimit = require("express-rate-limit");

const isUnsafeKey = (key) => key.startsWith("$") || key.includes(".");

const sanitizeKeys = (value) => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry) => sanitizeKeys(entry));
    return;
  }

  Object.keys(value).forEach((key) => {
    if (isUnsafeKey(key)) {
      delete value[key];
      return;
    }
    sanitizeKeys(value[key]);
  });
};

const sanitizeRequestInput = (req, _res, next) => {
  sanitizeKeys(req.body);
  sanitizeKeys(req.query);
  next();
};

const buildLimiter = ({ windowMs, max, message, skip }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    skip
  });

const globalApiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: "Too many API requests. Please try again later."
});

const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: "Too many authentication attempts. Please try again later."
});

const writeApiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 180,
  message: "Too many write actions. Please slow down.",
  skip: (req) => req.method === "GET"
});

const uploadLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many uploads. Please try again later."
});

module.exports = {
  sanitizeRequestInput,
  globalApiLimiter,
  authLimiter,
  writeApiLimiter,
  uploadLimiter
};

