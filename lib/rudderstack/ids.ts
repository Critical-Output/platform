"use client";

import {
  ANALYTICS_ANON_ID_COOKIE,
  ANALYTICS_ANON_ID_QUERY_PARAM,
  ANALYTICS_ANON_ID_QUERY_PARAM_LEGACY,
  ANALYTICS_ANON_ID_STORAGE_KEY,
  ANALYTICS_SESSION_ID_COOKIE,
  ANALYTICS_SESSION_ID_STORAGE_KEY,
} from "@/lib/rudderstack/constants";

type CookieOptions = {
  maxAgeSeconds?: number;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (v.length > 200) return null;
  return v;
};

const readCookie = (name: string): string | null => {
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    if (k !== name) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
};

const writeCookie = (name: string, value: string, options: CookieOptions = {}) => {
  const base = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge =
    typeof options.maxAgeSeconds === "number" ? `; Max-Age=${options.maxAgeSeconds}` : "";
  document.cookie = `${base}${maxAge}${secure}`;
};

export const setAnonymousId = (anonymousId: string) => {
  const v = normalizeId(anonymousId);
  if (!v) return;

  try {
    localStorage.setItem(ANALYTICS_ANON_ID_STORAGE_KEY, v);
  } catch {
    // ignore
  }

  try {
    writeCookie(ANALYTICS_ANON_ID_COOKIE, v, { maxAgeSeconds: 60 * 60 * 24 * 365 });
  } catch {
    // ignore
  }
};

export const getOrCreateAnonymousId = (): string => {
  let v: string | null = null;

  try {
    v = normalizeId(localStorage.getItem(ANALYTICS_ANON_ID_STORAGE_KEY));
  } catch {
    // ignore
  }

  if (!v) {
    try {
      v = normalizeId(readCookie(ANALYTICS_ANON_ID_COOKIE));
    } catch {
      // ignore
    }
  }

  if (!v) v = crypto.randomUUID();

  // Ensure both cookie + localStorage are populated for persistence + server-side access.
  setAnonymousId(v);
  return v;
};

export const setSessionId = (sessionId: string) => {
  const v = normalizeId(sessionId);
  if (!v) return;

  try {
    sessionStorage.setItem(ANALYTICS_SESSION_ID_STORAGE_KEY, v);
  } catch {
    // ignore
  }

  // Keep as a short-lived first-party cookie for server-side attribution.
  try {
    writeCookie(ANALYTICS_SESSION_ID_COOKIE, v, { maxAgeSeconds: 60 * 30 });
  } catch {
    // ignore
  }
};

export const getOrCreateSessionId = (): string => {
  let v: string | null = null;

  try {
    v = normalizeId(sessionStorage.getItem(ANALYTICS_SESSION_ID_STORAGE_KEY));
  } catch {
    // ignore
  }

  if (!v) {
    try {
      v = normalizeId(readCookie(ANALYTICS_SESSION_ID_COOKIE));
    } catch {
      // ignore
    }
  }

  if (!v) v = crypto.randomUUID();

  setSessionId(v);
  return v;
};

export const consumeAnonymousIdFromHref = (
  href: string,
): { anonymousId: string; cleanedHref: string } | null => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const fromParam =
    normalizeId(url.searchParams.get(ANALYTICS_ANON_ID_QUERY_PARAM)) ??
    normalizeId(url.searchParams.get(ANALYTICS_ANON_ID_QUERY_PARAM_LEGACY));

  if (!fromParam) return null;

  url.searchParams.delete(ANALYTICS_ANON_ID_QUERY_PARAM);
  url.searchParams.delete(ANALYTICS_ANON_ID_QUERY_PARAM_LEGACY);
  return { anonymousId: fromParam, cleanedHref: url.toString() };
};

export const consumeAnonymousIdFromUrl = (): { anonymousId: string; updated: boolean } | null => {
  const consumed = consumeAnonymousIdFromHref(window.location.href);
  if (!consumed) return null;

  setAnonymousId(consumed.anonymousId);
  window.history.replaceState(window.history.state, "", consumed.cleanedHref);

  return { anonymousId: consumed.anonymousId, updated: true };
};

const normalizeHostname = (value: string): string => value.trim().toLowerCase().replace(/\.$/, "");

const getCrossDomainTrackingHostnames = (): string[] => {
  const raw = process.env.NEXT_PUBLIC_CROSS_DOMAIN_TRACKING_DOMAINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => normalizeHostname(s))
    .filter(Boolean);
};

const isHostnameAllowed = (hostname: string, allowlist: string[]): boolean => {
  const normalizedHostname = normalizeHostname(hostname);
  for (const entry of allowlist) {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(2);
      if (normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`)) return true;
      continue;
    }
    if (normalizedHostname === entry) return true;
  }
  return false;
};

export const decorateUrlWithAnonymousId = (
  href: string,
  anonymousId: string,
  baseHref = window.location.href,
): string => {
  const url = new URL(href, baseHref);
  url.searchParams.set(ANALYTICS_ANON_ID_QUERY_PARAM, anonymousId);
  return url.toString();
};

export const decorateDocumentOutboundLinks = () => {
  const allowlist = getCrossDomainTrackingHostnames();
  if (allowlist.length === 0) return;

  const anonymousId = getOrCreateAnonymousId();
  const currentHostname = window.location.hostname;

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const a of anchors) {
    const rawHref = a.getAttribute("href");
    if (!rawHref) continue;

    let url: URL;
    try {
      url = new URL(rawHref, window.location.href);
    } catch {
      continue;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (url.hostname === currentHostname) continue;
    if (!isHostnameAllowed(url.hostname, allowlist)) continue;
    if (url.searchParams.has(ANALYTICS_ANON_ID_QUERY_PARAM)) continue;

    url.searchParams.set(ANALYTICS_ANON_ID_QUERY_PARAM, anonymousId);
    a.href = url.toString();
  }
};
