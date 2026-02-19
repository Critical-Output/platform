import assert from "node:assert/strict";
import { test } from "node:test";

import { hasAuthStatusQuery, normalizeRedirectPath } from "../lib/auth/paths";

test("normalizeRedirectPath accepts internal paths", () => {
  assert.equal(normalizeRedirectPath("/profile"), "/profile");
  assert.equal(normalizeRedirectPath("/courses?id=1"), "/courses?id=1");
});

test("normalizeRedirectPath rejects external urls and protocol-relative paths", () => {
  assert.equal(normalizeRedirectPath("https://evil.example"), "/profile");
  assert.equal(normalizeRedirectPath("//evil.example"), "/profile");
});

test("normalizeRedirectPath uses fallback when missing", () => {
  assert.equal(normalizeRedirectPath(undefined, "/auth/login"), "/auth/login");
});

test("hasAuthStatusQuery detects auth feedback params", () => {
  assert.equal(hasAuthStatusQuery(new URLSearchParams("error=sync%20failed")), true);
  assert.equal(hasAuthStatusQuery(new URLSearchParams("success=Password%20updated")), true);
});

test("hasAuthStatusQuery ignores unrelated params", () => {
  assert.equal(hasAuthStatusQuery(new URLSearchParams("next=%2Fprofile")), false);
});
