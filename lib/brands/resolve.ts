const DEFAULT_BRAND_SLUG_ENV_KEY = "NEXT_PUBLIC_BRAND_SLUG";
const DOMAIN_MAP_ENV_KEY = "BRAND_DOMAIN_MAP";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHostname = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutTrailingDot = trimmed.replace(/\.$/, "");

  // IPv6 hosts may arrive in bracket notation with an optional port.
  const bracketedMatch = withoutTrailingDot.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedMatch?.[1]) return bracketedMatch[1];

  const colonCount = (withoutTrailingDot.match(/:/g) ?? []).length;
  if (colonCount === 1) {
    const [hostPart, portPart] = withoutTrailingDot.split(":");
    if (portPart && /^\d+$/.test(portPart)) return hostPart ?? "";
  }

  return withoutTrailingDot;
};

export const parseBrandDomainMap = (raw: string | undefined): Map<string, string> => {
  const entries = new Map<string, string>();
  if (!raw) return entries;

  for (const pair of raw.split(",")) {
    const [hostRaw, slugRaw] = pair.split("=");
    if (!hostRaw || !slugRaw) continue;

    const host = normalizeHostname(hostRaw);
    const slug = slugRaw.trim().toLowerCase();
    if (!host || !slug) continue;

    entries.set(host, slug);
  }

  return entries;
};

const deriveSlugFromHost = (host: string): string | null => {
  const normalizedHost = normalizeHostname(host);
  if (!normalizedHost) return null;
  if (LOOPBACK_HOSTS.has(normalizedHost)) return null;
  if (normalizedHost.includes(":")) return null;

  const parts = normalizedHost.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  const candidate = parts[0]?.replace(/[^a-z0-9-]/g, "") ?? "";
  return candidate || null;
};

export const resolveBrandSlugFromHost = (host: string | null | undefined): string | null => {
  const normalizedHost = normalizeHostname(host ?? "");
  if (!normalizedHost) return null;

  const map = parseBrandDomainMap(process.env[DOMAIN_MAP_ENV_KEY]);
  const mapped = map.get(normalizedHost);
  if (mapped) return mapped;

  return deriveSlugFromHost(normalizedHost);
};

export const resolveBrandSlugFromHeaders = (headers: Headers): string | null => {
  const forwardedHost = headers.get("x-forwarded-host");
  const firstForwardedHost = forwardedHost?.split(",")[0]?.trim();
  const host = firstForwardedHost || headers.get("host");

  const fromHost = resolveBrandSlugFromHost(host);
  if (fromHost) return fromHost;

  const configuredFallback = process.env[DEFAULT_BRAND_SLUG_ENV_KEY]?.trim().toLowerCase();
  return configuredFallback || null;
};
