const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const services = [
  { name: "backend", port: 5000, startArgs: ["run", "start:backend"] },
  { name: "frontend", port: 3000, startArgs: ["run", "start:frontend"] }
];

const CHECK_INTERVAL_MS = 10000;
const RESTART_COOLDOWN_MS = 15000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isUp = (port) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, "127.0.0.1");
  });

const startService = ({ name, startArgs }) => {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "start", "\"\"", npmCmd, ...startArgs], {
          cwd: rootDir,
          detached: true,
          stdio: "ignore",
          windowsHide: true
        })
      : spawn(npmCmd, startArgs, {
          cwd: rootDir,
          detached: true,
          stdio: "ignore"
        });
  child.unref();
  console.log(`[start] ${name}: npm ${startArgs.join(" ")}`);
};

const lastStartAt = new Map();

const ensureServices = async () => {
  for (const service of services) {
    const up = await isUp(service.port);
    if (up) {
      continue;
    }
    const lastStart = lastStartAt.get(service.name) || 0;
    const now = Date.now();
    if (now - lastStart < RESTART_COOLDOWN_MS) {
      continue;
    }
    lastStartAt.set(service.name, now);
    startService(service);
  }
};

const main = async () => {
  console.log("[dev] watchdog running");
  await ensureServices();

  while (true) {
    await wait(CHECK_INTERVAL_MS);
    await ensureServices();
  }
};

process.on("SIGINT", () => {
  console.log("\n[dev] watchdog stopped");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[dev] watchdog stopped");
  process.exit(0);
});

main().catch((error) => {
  console.error("[dev] watchdog failed:", error?.message || error);
  process.exit(1);
});
