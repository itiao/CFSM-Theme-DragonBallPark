/**
 * 用 CDP 给页面截图。
 *
 * 为什么不用 `chrome --screenshot --virtual-time-budget`：
 * 3D 公园的 requestAnimationFrame 会一直排队，虚拟时间永远推进不到头，命令会挂死。
 * 这里改成「真等 N 秒 + Page.captureScreenshot」，对持续动画的页面也稳。
 *
 * 用法：
 *   node scripts/shot.mjs <url> <输出png> [宽] [高] [等待毫秒]
 */

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const [, , url, out, widthArg, heightArg, waitArg] = process.argv;
if (!url || !out) {
  console.error("用法: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs]");
  process.exit(1);
}

const width = Number(widthArg ?? 1600);
const height = Number(heightArg ?? 1000);
const waitMs = Number(waitArg ?? 9000);
const port = 9222 + Math.floor(Math.random() * 500);

const profile = mkdtempSync(join(tmpdir(), "cfsm-shot-"));
const chrome = spawn(
  CHROME_CANDIDATES[0],
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-extensions",
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // 还没起来
    }
    await sleep(250);
  }
  throw new Error("Chrome 调试端口没起来");
}

let id = 0;
function makeClient(socket) {
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
}

try {
  const wsUrl = await waitForTarget();
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  const send = makeClient(socket);

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await sleep(waitMs);

  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`已保存 ${out}`);
} finally {
  chrome.kill();
}
