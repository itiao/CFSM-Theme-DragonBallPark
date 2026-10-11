/**
 * fetch 封装：统一带上 JWT / Turnstile 请求头，统一处理 401 / 403。
 *
 * 只允许访问 CF-Server-Monitor 的公开接口（见 `api.ts`），
 * 不碰任何 `/admin/api` 之类的管理端接口。
 */

import {
  clearJwtToken,
  clearTurnstileCredentials,
  getApiBases,
  getJwtToken,
  getTurnstileToken,
  getTurnstileVerified,
  setTurnstileVerified,
} from "./config";

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  /** 指定后端；不传则用主后端。 */
  base?: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  /** 是否需要登录令牌（默认自动带上，没有就不带）。 */
  auth?: boolean;
}

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  if (options.auth !== false) {
    const jwt = getJwtToken();
    if (jwt) headers.set("Authorization", `Bearer ${jwt}`);
  }

  // 优先用已验证凭证复用，省掉反复人机验证；没有才带一次性 token。
  const verified = getTurnstileVerified();
  if (verified) headers.set("X-Turnstile-Verified", verified);
  else {
    const token = getTurnstileToken();
    if (token) headers.set("X-Turnstile-Token", token);
  }

  return headers;
}

/** 解析响应体里可能出现的 turnstile_verified，回写缓存。 */
function absorbTurnstileVerified(payload: unknown): void {
  if (typeof payload !== "object" || payload === null) return;
  const value = (payload as Record<string, unknown>).turnstile_verified;
  if (typeof value === "string" && value) setTurnstileVerified(value);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = options.base ?? getApiBases()[0] ?? "";
  const url = `${base}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new HttpError(0, "网络错误", error);
  }

  if (response.status === 401) {
    // 令牌失效：清掉，让登录态重查。不要 location.reload()，避免刷新循环。
    clearJwtToken();
    throw new HttpError(401, "未登录或登录已过期", await safeJson(response));
  }

  if (response.status === 403) {
    // 人机验证失效：清凭证，界面据此重新弹验证。
    clearTurnstileCredentials();
    throw new HttpError(403, "需要人机验证", await safeJson(response));
  }

  if (!response.ok) {
    throw new HttpError(response.status, `请求失败（HTTP ${response.status}）`, await safeJson(response));
  }

  if (response.status === 204) return undefined as T;

  const payload = (await safeJson(response)) as T;
  absorbTurnstileVerified(payload);
  return payload;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 并发请求多个后端，把结果合并。
 *
 * 多站部署时每个后端只返回自己的节点，合并后当作一个站点展示。
 * 单个后端失败不拖垮整体 —— 返回它那份空结果。
 */
export async function requestAllBases<T>(
  path: string,
  options: Omit<RequestOptions, "base"> = {},
): Promise<T[]> {
  const bases = getApiBases();
  const results = await Promise.allSettled(
    bases.map((base) => request<T>(path, { ...options, base })),
  );
  const values: T[] = [];
  for (const item of results) {
    if (item.status === "fulfilled") values.push(item.value);
  }
  return values;
}
