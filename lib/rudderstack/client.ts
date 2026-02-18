"use client";

type RudderAnalyticsLike = {
  load: (writeKey: string, dataPlaneUrl: string, options?: Record<string, unknown>) => void;
  page: (...args: unknown[]) => void;
  track: (...args: unknown[]) => void;
  identify: (...args: unknown[]) => void;
  group: (...args: unknown[]) => void;
  reset: (...args: unknown[]) => void;
};

let client: RudderAnalyticsLike | null = null;
let initPromise: Promise<RudderAnalyticsLike | null> | null = null;

const isDisabled = () => {
  const v = process.env.NEXT_PUBLIC_RUDDERSTACK_DISABLED;
  return v === "true" || v === "1";
};

const getConfig = () => {
  const writeKey = process.env.NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY;
  const dataPlaneUrl = process.env.NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL;

  if (!writeKey || !dataPlaneUrl) return null;
  return { writeKey, dataPlaneUrl };
};

export const getRudderStackClient = async (): Promise<RudderAnalyticsLike | null> => {
  if (client) return client;
  if (initPromise) return initPromise;
  if (isDisabled()) return null;

  const config = getConfig();
  if (!config) return null;

  initPromise = import("@rudderstack/analytics-js")
    .then((mod) => {
      const Ctor =
        (mod as { RudderAnalytics?: unknown }).RudderAnalytics ??
        (mod as { default?: unknown }).default;

      if (typeof Ctor !== "function") return null;

      const instance = new (Ctor as new () => RudderAnalyticsLike)();
      instance.load(config.writeKey, config.dataPlaneUrl);

      client = instance;
      return client;
    })
    .catch(() => null)
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
};

export const rudderstack = {
  page: async (...args: Parameters<RudderAnalyticsLike["page"]>) => {
    const ra = await getRudderStackClient();
    ra?.page(...args);
  },
  track: async (...args: Parameters<RudderAnalyticsLike["track"]>) => {
    const ra = await getRudderStackClient();
    ra?.track(...args);
  },
  identify: async (...args: Parameters<RudderAnalyticsLike["identify"]>) => {
    const ra = await getRudderStackClient();
    ra?.identify(...args);
  },
  group: async (...args: Parameters<RudderAnalyticsLike["group"]>) => {
    const ra = await getRudderStackClient();
    ra?.group(...args);
  },
  reset: async (...args: Parameters<RudderAnalyticsLike["reset"]>) => {
    const ra = await getRudderStackClient();
    ra?.reset(...args);
  },
};

