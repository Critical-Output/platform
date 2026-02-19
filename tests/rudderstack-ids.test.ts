import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { ANALYTICS_ANON_ID_STORAGE_KEY } from "../lib/rudderstack/constants";
import {
  consumeAnonymousIdFromHref,
  consumeAnonymousIdFromUrl,
  decorateDocumentOutboundLinks,
  decorateUrlWithAnonymousId,
} from "../lib/rudderstack/ids";

type StorageSeed = Record<string, string>;

type SetupBrowserOptions = {
  href: string;
  historyState?: unknown;
  anchors?: HTMLAnchorElement[];
  localStorageSeed?: StorageSeed;
  initialCookie?: string;
};

const globalKeys = ["window", "document", "localStorage", "sessionStorage"] as const;
type GlobalKey = (typeof globalKeys)[number];

const originalGlobals = Object.fromEntries(
  globalKeys.map((key) => [key, Object.prototype.hasOwnProperty.call(globalThis, key) ? (globalThis as Record<string, unknown>)[key] : undefined]),
) as Record<GlobalKey, unknown>;

const setGlobalValue = (key: GlobalKey, value: unknown) => {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
};

const restoreGlobalValue = (key: GlobalKey) => {
  const original = originalGlobals[key];
  if (original === undefined) {
    delete (globalThis as Record<string, unknown>)[key];
    return;
  }
  setGlobalValue(key, original);
};

const createStorageMock = (seed: StorageSeed = {}): Storage => {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
};

const createAnchor = (initialHref: string): HTMLAnchorElement => {
  let href = initialHref;
  return {
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
    getAttribute: (name: string) => (name === "href" ? href : null),
  } as unknown as HTMLAnchorElement;
};

const setupBrowser = (options: SetupBrowserOptions) => {
  let href = options.href;
  let historyState = options.historyState ?? null;
  let cookie = options.initialCookie ?? "";

  const anchors = options.anchors ?? [];
  const replaceStateCalls: Array<{ state: unknown; url: string }> = [];

  const location = {
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
    get hostname() {
      return new URL(href).hostname;
    },
    get protocol() {
      return new URL(href).protocol;
    },
  } as unknown as Location;

  const history = {
    get state() {
      return historyState;
    },
    replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
      historyState = state;
      if (typeof url === "string") {
        href = new URL(url, href).toString();
      } else if (url instanceof URL) {
        href = new URL(url.toString(), href).toString();
      }
      replaceStateCalls.push({ state, url: href });
    },
  } as unknown as History;

  const documentMock = {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      const pair = value.split(";")[0]?.trim();
      if (!pair) return;

      const eq = pair.indexOf("=");
      if (eq === -1) return;

      const key = pair.slice(0, eq);
      const existing = cookie
        ? cookie
            .split(";")
            .map((chunk) => chunk.trim())
            .filter(Boolean)
        : [];
      const filtered = existing.filter((entry) => !entry.startsWith(`${key}=`));
      filtered.push(pair);
      cookie = filtered.join("; ");
    },
    querySelectorAll: () => anchors,
  } as unknown as Document;

  const windowMock = { location, history } as unknown as Window & typeof globalThis;

  setGlobalValue("window", windowMock);
  setGlobalValue("document", documentMock);
  setGlobalValue("localStorage", createStorageMock(options.localStorageSeed));
  setGlobalValue("sessionStorage", createStorageMock());

  return {
    getHref: () => href,
    getHistoryState: () => historyState,
    replaceStateCalls,
  };
};

const originalCrossDomainAllowlist = process.env.NEXT_PUBLIC_CROSS_DOMAIN_TRACKING_DOMAINS;

afterEach(() => {
  for (const key of globalKeys) {
    restoreGlobalValue(key);
  }

  if (originalCrossDomainAllowlist === undefined) {
    delete process.env.NEXT_PUBLIC_CROSS_DOMAIN_TRACKING_DOMAINS;
  } else {
    process.env.NEXT_PUBLIC_CROSS_DOMAIN_TRACKING_DOMAINS = originalCrossDomainAllowlist;
  }
});

test("consumeAnonymousIdFromHref consumes anonymous_id and preserves other query params", () => {
  const consumed = consumeAnonymousIdFromHref(
    "https://brand-a.example/products?anonymous_id=anon_123&utm_source=newsletter",
  );

  assert.deepEqual(consumed, {
    anonymousId: "anon_123",
    cleanedHref: "https://brand-a.example/products?utm_source=newsletter",
  });
});

test("consumeAnonymousIdFromHref supports legacy aid param", () => {
  const consumed = consumeAnonymousIdFromHref("https://brand-a.example/?aid=legacy_anon");

  assert.deepEqual(consumed, {
    anonymousId: "legacy_anon",
    cleanedHref: "https://brand-a.example/",
  });
});

test("consumeAnonymousIdFromHref returns null when no anonymous id is present", () => {
  const consumed = consumeAnonymousIdFromHref("https://brand-a.example/pricing?plan=premium");
  assert.equal(consumed, null);
});

test("consumeAnonymousIdFromUrl preserves history state while cleaning URL", () => {
  const existingState = { tree: ["__PAGE__"], as: "/products" };
  const browser = setupBrowser({
    href: "https://brand-a.example/products?anonymous_id=anon_123&utm_source=newsletter",
    historyState: existingState,
  });

  const consumed = consumeAnonymousIdFromUrl();

  assert.deepEqual(consumed, { anonymousId: "anon_123", updated: true });
  assert.equal(browser.replaceStateCalls.length, 1);
  assert.equal(browser.replaceStateCalls[0]?.state, existingState);
  assert.equal(browser.getHistoryState(), existingState);
  assert.equal(browser.getHref(), "https://brand-a.example/products?utm_source=newsletter");
});

test("decorateUrlWithAnonymousId decorates relative URLs using provided base href", () => {
  const decorated = decorateUrlWithAnonymousId(
    "/pricing?plan=premium",
    "anon_999",
    "https://brand-a.example/home",
  );

  assert.equal(decorated, "https://brand-a.example/pricing?plan=premium&anonymous_id=anon_999");
});

test("decorateUrlWithAnonymousId overrides an existing anonymous_id value", () => {
  const decorated = decorateUrlWithAnonymousId(
    "https://brand-b.example/checkout?anonymous_id=old_value",
    "anon_new",
    "https://brand-a.example/home",
  );

  assert.equal(decorated, "https://brand-b.example/checkout?anonymous_id=anon_new");
});

test("decorateDocumentOutboundLinks decorates only allowed outbound links", () => {
  process.env.NEXT_PUBLIC_CROSS_DOMAIN_TRACKING_DOMAINS = "*.example.com,brand-c.example";

  const allowed = createAnchor("https://store.example.com:3000/checkout?step=shipping");
  const disallowed = createAnchor("https://attacker.test/phish");
  const sameHost = createAnchor("https://brand-a.example/pricing");
  const alreadyDecorated = createAnchor("https://shop.example.com/cart?anonymous_id=existing");
  const nonHttp = createAnchor("mailto:sales@example.com");

  setupBrowser({
    href: "https://brand-a.example/",
    anchors: [allowed, disallowed, sameHost, alreadyDecorated, nonHttp],
    localStorageSeed: { [ANALYTICS_ANON_ID_STORAGE_KEY]: "anon_456" },
  });

  decorateDocumentOutboundLinks();

  const allowedUrl = new URL(allowed.href);
  assert.equal(allowedUrl.searchParams.get("anonymous_id"), "anon_456");
  assert.equal(disallowed.href, "https://attacker.test/phish");
  assert.equal(sameHost.href, "https://brand-a.example/pricing");
  assert.equal(alreadyDecorated.href, "https://shop.example.com/cart?anonymous_id=existing");
  assert.equal(nonHttp.href, "mailto:sales@example.com");
});
