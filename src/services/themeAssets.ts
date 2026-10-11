/**
 * 主题静态资源的路径解析。
 *
 * ⚠️ CF-Server-Monitor 的 Worker **只代理 `/assets/` 下的文件**（见其
 * `src/handlers/frontend.js` 的 `normalizeAssetPath`）。其它路径一律回落到 index.html，
 * 返回的是 **HTTP 200 + 一坨 HTML**，不是 404 —— 所以素材放错位置时控制台一声不吭，
 * 只是图片不显示、JSON 解析失败、模型加载不了。主题自己的素材必须落在 `assets/` 里。
 *
 * 另外支持把素材托管到别处（设置里的「素材托管前缀」），此时前缀优先。
 */

const ABSOLUTE = /^(?:https?:)?\/\//i;

export function resolveThemeAsset(path: string, assetBase = ""): string {
  if (!path) return "";
  // 外链、协议相对、data URI 原样放行。
  if (ABSOLUTE.test(path) || path.startsWith("data:")) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = assetBase.trim().replace(/\/+$/, "");
  if (base) return `${base}${normalized}`;

  // 没配外部前缀时，统一落到 /assets/ 下（Worker 唯一会代理的目录）。
  if (normalized.startsWith("/assets/")) return normalized;
  return `/assets${normalized}`;
}
