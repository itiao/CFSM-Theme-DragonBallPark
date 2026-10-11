import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

/**
 * 把主题版本写进产物的 <meta name="theme-version">。
 *
 * CF-Server-Monitor 对分支地址有约一小时缓存，出问题时看页面源码就能确认线上跑的是哪一版。
 */
function themeVersionMeta(version: string): Plugin {
  return {
    name: "cfsm-theme-version",
    transformIndexHtml(html) {
      return html.replace(
        "</head>",
        `  <meta name="theme-version" content="DragonBallPark v${version}" />\n  </head>`,
      );
    },
  };
}

/**
 * 把 .env 里的 API_BASE 写进 dev server 的 <meta name="apiBase">，方便本地连线上后端调试。
 * 留空时（Workers 同源 / mock）什么都不做，前端回落到 window.location.origin。
 */
function devApiBaseMeta(apiBase: string): Plugin {
  const escaped = apiBase
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return {
    name: "cfsm-dev-api-base",
    apply: "serve",
    transformIndexHtml(html) {
      if (!apiBase) return html;
      return html.replace(
        /<meta name="apiBase" content="[^"]*"\s*\/?>/,
        () => `<meta name="apiBase" content="${escaped}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // 前缀传空串才能读到没有 VITE_ 前缀的 API_BASE。
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = (env.API_BASE ?? "").trim();

  return {
    plugins: [react(), tailwindcss(), themeVersionMeta(pkg.version), devApiBaseMeta(apiBase)],
    // CF-Server-Monitor 的主题产物只能是 index.html + assets/，且会被挂到站点根路径或
    // GitHub Pages 的子路径下，因此资源引用必须是相对路径。
    base: "./",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      // 与 CSS 基线对齐：全站用到 color-mix()/oklch()，需要 Chrome 111 / Safari 16.2+。
      target: ["es2022", "chrome111", "safari16.2", "firefox113"],
      assetsDir: "assets",
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, "/");
            if (!normalized.includes("/node_modules/")) return;
            if (/\/node_modules\/(?:react|react-dom|react-router|react-router-dom)\//.test(normalized))
              return "react";
            if (/\/node_modules\/(?:three|@types\/three)\//.test(normalized)) return "three";
            if (/\/node_modules\/uplot\//.test(normalized)) return "charts";
          },
        },
      },
    },
  };
});
