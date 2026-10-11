/**
 * 模拟 CF-Server-Monitor 的主题代理，用来在本地复现线上语义。
 *
 * 照抄 `src/handlers/frontend.js` 的行为：
 *   - `/assets/<path>` → 从主题产物里取文件，按扩展名给 Content-Type
 *   - 其它任何路径（含 `/`）→ **回落 index.html**，返回 200
 *   - 所有响应带 `X-Content-Type-Options: nosniff`
 *
 * 关键就在这个「回落」：素材放错目录时不会 404，而是拿到一坨 HTML，
 * 浏览器不报错、功能静默失效。这个脚本就是为了在本地复现那种假象。
 *
 * 用法：node scripts/mock-cfsm-proxy.mjs <dist目录> [端口]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const distDir = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 8100);

const CONTENT_TYPES = {
  ".html": "text/html;charset=UTF-8",
  ".js": "application/javascript;charset=UTF-8",
  ".mjs": "application/javascript;charset=UTF-8",
  ".css": "text/css;charset=UTF-8",
  ".json": "application/json;charset=UTF-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

async function readIfFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  const send = (body, type, status = 200) => {
    res.writeHead(status, {
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(body);
  };

  // 只代理 /assets/ 下的文件 —— 与 CFSM 一致。
  if (pathname.startsWith("/assets/")) {
    const relative = normalize(pathname.slice("/assets/".length)).replace(/^(\.\.[/\\])+/, "");
    const body = await readIfFile(join(distDir, "assets", relative));
    if (body) {
      send(body, contentTypeFor(relative));
      return;
    }
    send("Theme file not found", "text/plain;charset=UTF-8", 404);
    return;
  }

  // 其它一切路径都回落到 index.html（CFSM 的行为）。
  const index = await readIfFile(join(distDir, "index.html"));
  if (!index) {
    send("index.html missing", "text/plain;charset=UTF-8", 500);
    return;
  }
  send(index, "text/html;charset=UTF-8");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`模拟 CFSM 代理已启动： http://127.0.0.1:${port}/  (产物目录 ${distDir})`);
});
