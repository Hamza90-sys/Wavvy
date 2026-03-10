const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const services = [
  { name: "backend", port: 5000, startArgs: ["run", "start:backend"] },
  { name: "frontend", port: 3000, startArgs: ["run", "start:frontend"] }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isStablyUp = async (port) => {
  const first = await isUp(port);
  if (!first) return false;
  await wait(1200);
  const second = await isUp(port);
  if (!second) return false;
  await wait(1200);
  return isUp(port);
};

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

(async () => {
  for (const service of services) {
    const up = await isUp(service.port);
    if (up) {
      console.log(`[ok] ${service.name} already running on :${service.port}`);
      continue;
    }
    startService(service);
  }

  await wait(9000);

  let allUp = true;
  for (const service of services) {
    const up = await isStablyUp(service.port);
    if (up) {
      console.log(`[ok] ${service.name} reachable on :${service.port}`);
    } else {
      allUp = false;
      console.log(`[down] ${service.name} still not reachable on :${service.port}`);
    }
  }

  process.exit(allUp ? 0 : 1);
})();
