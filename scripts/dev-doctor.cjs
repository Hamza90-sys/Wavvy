const http = require("http");
const net = require("net");

const checks = [
  { name: "frontend", host: "127.0.0.1", port: 3000, path: "/", hint: "Run `npm run dev:ensure` from the project root." },
  { name: "backend", host: "127.0.0.1", port: 5000, path: "/", hint: "Run `npm run dev:ensure` from the project root." }
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pingTcp = ({ host, port }) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(1200);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });

const pingHttp = ({ host, port, path }) =>
  new Promise((resolve) => {
    const req = http.get(
      { host, port, path, timeout: 1500 },
      (res) => {
        // Any HTTP response means the service is up.
        res.resume();
        resolve(true);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });

const checkService = async (check, attempts = 6, intervalMs = 1500) => {
  for (let i = 0; i < attempts; i += 1) {
    const tcpUp = await pingTcp(check);
    if (tcpUp) {
      const httpUp = await pingHttp(check);
      if (httpUp) return true;
    }
    if (i < attempts - 1) {
      await wait(intervalMs);
    }
  }
  return false;
};

(async () => {
  let allUp = true;

  for (const check of checks) {
    const up = await checkService(check);
    if (up) {
      console.log(`[ok] ${check.name} is reachable on ${check.host}:${check.port}`);
    } else {
      allUp = false;
      console.log(`[down] ${check.name} is not reachable on ${check.host}:${check.port}`);
      console.log(`       ${check.hint}`);
    }
  }

  process.exit(allUp ? 0 : 1);
})();
