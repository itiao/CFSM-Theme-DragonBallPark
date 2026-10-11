/**
 * CF-Server-Monitor 运行时配置。
 *
 * 两种部署形态：
 * - 由 Worker 托管（主题商店安装）：与后端同源，`apiBase` 留空即可。
 * - 纯静态托管（GitHub Pages 等）：由 `<meta name="apiBase" content="https://a,https://b">`
 *   指定一个或多个后端；此时后端需配置 `CORS_ALLOWED_ORIGINS`。
 *
 * JWT 与 Turnstile 凭证的 localStorage 键名与内置默认主题保持一致，
 * 用户在 /admin 登录后回到本主题可直接复用登录态。
 */

const API_BASE_META_NAME = "apiBase";

export const JWT_STORAGE_KEY = "jwt_token";
export const TURNSTILE_TOKEN_KEY = "turnstile_token";
export const TURNSTILE_VERIFIED_KEY = "turnstile_verified";

let cachedApiBases: string[] | null = null;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeBase(value: string): string {
  const raw = stripTrailingSlash(String(value || "").trim());
  if (!raw) return "";
  try {
    // 只保留 origin：文档要求 apiBase 不含路径 / 查询串。
    return stripTrailingSlash(new URL(raw, window.location.href).origin);
  } catch {
    return "";
  }
}

function readMetaApiBases(): string[] {
  if (typeof document === "undefined") return [];
  const content = document
    .querySelector<HTMLMetaElement>(`meta[name="${API_BASE_META_NAME}"]`)
    ?.content?.trim();
  if (!content) return [];
  return content.split(",").map(normalizeBase).filter(Boolean);
}

/** 后端地址列表，至少含一项。 */
export function getApiBases(): string[] {
  if (cachedApiBases) return cachedApiBases;
  const fromMeta = readMetaApiBases();
  cachedApiBases =
    fromMeta.length > 0 ? Array.from(new Set(fromMeta)) : [stripTrailingSlash(window.location.origin)];
  return cachedApiBases;
}

export function getPrimaryApiBase(): string {
  return getApiBases()[0] ?? stripTrailingSlash(window.location.origin);
}

export function hasMultipleApiBases(): boolean {
  return getApiBases().length > 1;
}

export function toWebSocketBase(base: string): string {
  try {
    const url = new URL(base);
    return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  } catch {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }
}

/** 旗帜与 OS 图标由后端默认皮肤提供，主题不打包；跨域时拼到后端 origin。 */
export function hostAssetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getPrimaryApiBase();
  if (!base || base === stripTrailingSlash(window.location.origin)) return normalized;
  return `${base}${normalized}`;
}

/** 管理后台固定由内置默认主题接管，第三方主题只能跳过去。 */
export function getAdminUrl(): string {
  return `${getPrimaryApiBase()}/admin#/admin`;
}

/* ---------------------------- 本地存储 ---------------------------- */

// 统一走 window.localStorage：Node 自带的同名全局在没有 --localstorage-file 时不可用。
function readStorage(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // 隐私模式下 localStorage 不可写，降级为匿名访问。
  }
}

export function getJwtToken(): string {
  return readStorage(JWT_STORAGE_KEY);
}

const jwtClearedListeners = new Set<() => void>();

/** 令牌被清掉（后端回 401）时通知：登录态要跟着重查一次。 */
export function subscribeJwtTokenCleared(listener: () => void): () => void {
  jwtClearedListeners.add(listener);
  return () => {
    jwtClearedListeners.delete(listener);
  };
}

export function clearJwtToken(): void {
  const hadToken = Boolean(readStorage(JWT_STORAGE_KEY));
  writeStorage(JWT_STORAGE_KEY, "");
  if (hadToken) for (const listener of jwtClearedListeners) listener();
}

export function getTurnstileToken(): string {
  return readStorage(TURNSTILE_TOKEN_KEY);
}

export function setTurnstileToken(token: string): void {
  writeStorage(TURNSTILE_TOKEN_KEY, token);
}

export function getTurnstileVerified(): string {
  return readStorage(TURNSTILE_VERIFIED_KEY);
}

const turnstileVerifiedListeners = new Set<() => void>();

export function subscribeTurnstileVerified(listener: () => void): () => void {
  turnstileVerifiedListeners.add(listener);
  return () => {
    turnstileVerifiedListeners.delete(listener);
  };
}

function emitTurnstileVerifiedChange(): void {
  for (const listener of [...turnstileVerifiedListeners]) listener();
}

/** 一次成功验证的凭证有效期约 1 小时，缓存后可省掉重复的人机验证。 */
export function setTurnstileVerified(value: string): void {
  const changed = value !== getTurnstileVerified();
  writeStorage(TURNSTILE_VERIFIED_KEY, value);
  if (value) writeStorage(TURNSTILE_TOKEN_KEY, "");
  if (changed) emitTurnstileVerifiedChange();
}

const turnstileClearedListeners = new Set<() => void>();

export function subscribeTurnstileCredentialsCleared(listener: () => void): () => void {
  turnstileClearedListeners.add(listener);
  return () => {
    turnstileClearedListeners.delete(listener);
  };
}

export function clearTurnstileCredentials(): void {
  const hadVerified = Boolean(getTurnstileVerified());
  const hadCredentials = Boolean(getTurnstileToken() || hadVerified);
  writeStorage(TURNSTILE_TOKEN_KEY, "");
  writeStorage(TURNSTILE_VERIFIED_KEY, "");
  if (!hadCredentials) return;
  if (hadVerified) emitTurnstileVerifiedChange();
  for (const listener of [...turnstileClearedListeners]) listener();
}
