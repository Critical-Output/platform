import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  parseBrandDomainMap,
  resolveBrandSlugFromHeaders,
  resolveBrandSlugFromHost,
} from "../lib/brands/resolve";

const originalDomainMap = process.env.BRAND_DOMAIN_MAP;
const originalBrandSlug = process.env.NEXT_PUBLIC_BRAND_SLUG;

afterEach(() => {
  if (originalDomainMap === undefined) {
    delete process.env.BRAND_DOMAIN_MAP;
  } else {
    process.env.BRAND_DOMAIN_MAP = originalDomainMap;
  }

  if (originalBrandSlug === undefined) {
    delete process.env.NEXT_PUBLIC_BRAND_SLUG;
  } else {
    process.env.NEXT_PUBLIC_BRAND_SLUG = originalBrandSlug;
  }
});

test("parseBrandDomainMap parses host=slug pairs", () => {
  const map = parseBrandDomainMap("cti.example.com=cti, km.example.com=karen-miles");

  assert.equal(map.get("cti.example.com"), "cti");
  assert.equal(map.get("km.example.com"), "karen-miles");
});

test("resolveBrandSlugFromHost prefers explicit domain map", () => {
  process.env.BRAND_DOMAIN_MAP = "brand-a.example.com=cti";

  const resolved = resolveBrandSlugFromHost("brand-a.example.com:443");
  assert.equal(resolved, "cti");
});

test("resolveBrandSlugFromHost falls back to subdomain", () => {
  delete process.env.BRAND_DOMAIN_MAP;

  const resolved = resolveBrandSlugFromHost("sporting-clays-academy.example.com");
  assert.equal(resolved, "sporting-clays-academy");
});

test("resolveBrandSlugFromHost returns null for loopback hosts", () => {
  delete process.env.BRAND_DOMAIN_MAP;

  assert.equal(resolveBrandSlugFromHost("127.0.0.1:3000"), null);
  assert.equal(resolveBrandSlugFromHost("::1"), null);
  assert.equal(resolveBrandSlugFromHost("[::1]:3000"), null);
});

test("resolveBrandSlugFromHeaders falls back to NEXT_PUBLIC_BRAND_SLUG", () => {
  process.env.NEXT_PUBLIC_BRAND_SLUG = "cti";
  delete process.env.BRAND_DOMAIN_MAP;

  const headers = new Headers({ host: "localhost:3000" });
  const resolved = resolveBrandSlugFromHeaders(headers);
  assert.equal(resolved, "cti");
});

test("resolveBrandSlugFromHeaders uses fallback for loopback ipv4 host", () => {
  process.env.NEXT_PUBLIC_BRAND_SLUG = "cti";
  delete process.env.BRAND_DOMAIN_MAP;

  const headers = new Headers({ host: "127.0.0.1:3000" });
  const resolved = resolveBrandSlugFromHeaders(headers);
  assert.equal(resolved, "cti");
});
