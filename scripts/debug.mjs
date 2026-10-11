/**
 * 用 CDP 打开页面，收集控制台错误 / 未捕获异常 / 失败请求，并报告 #root 的渲染情况。
 *
 * 用法：node scripts/debug.mjs <url> [等待毫秒]
 */

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const url = process.argv[2];
const waitMs = Number(process.argv[3] ?? 15000);
if (!url) {
  console.error("用法: node scripts/debug.mjs <url> [waitMs]");
  process.exit(1);
}

const port = 9500 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "cfsm-dbg-"));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    `--user-data-dir=${profile}`,
    "--window-size=1600,1000",
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error("调试端口没起来");
}

let id = 0;
const events = [];
const errors = [];

try {
  const socket = new WebSocket(await target());
  await new Promise((res, rej) => {
    socket.addEventListener("open", res);
    socket.addEventListener("error", rej);
  });

  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      return;
    }
    // 事件
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(" ");
      events.push(`[console.${msg.params.type}] ${text}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push(`[未捕获异常] ${d.exception?.description || d.text}`);
    }
    if (msg.method === "Log.entryAdded") {
      const e = msg.params.entry;
      if (e.level === "error") errors.push(`[${e.source}] ${e.text}${e.url ? " @" + e.url : ""}`);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await send("Page.navigate", { url });
  await sleep(waitMs);

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    return r.result?.value;
  };

  const report = await evaluate(`(() => {
    const root = document.getElementById('root');
    const html = root ? root.innerHTML : '';
    return JSON.stringify({
      title: document.title,
      rootExists: !!root,
      rootHtmlLength: html.length,
      rootTextPreview: (root ? root.innerText : '').slice(0, 300),
      canvasCount: document.querySelectorAll('canvas').length,
      imgCount: document.querySelectorAll('img').length,
      themeVersion: (document.querySelector('meta[name="theme-version"]') || {}).content || '',
      appearance: document.documentElement.dataset.appearance || '',
      bodyChildren: document.body.children.length,
    });
  })()`);

  console.log("=== 页面状态 ===");
  console.log(JSON.stringify(JSON.parse(report), null, 2));

  console.log("\n=== 错误 ===");
  if (errors.length === 0) console.log("(没有错误)");
  else errors.slice(0, 25).forEach((e) => console.log(e));

  console.log("\n=== 控制台输出（最后 25 条）===");
  if (events.length === 0) console.log("(没有输出)");
  else events.slice(-25).forEach((e) => console.log(e));
} finally {
  chrome.kill();
}
