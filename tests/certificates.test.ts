import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  applyCertificateCourseLookupFilters,
  buildCertificatePdf,
  canAccessCertificatePdf,
  generateCertificateNumber,
} from "../lib/courses/certificates";

test("generateCertificateNumber produces expected format", () => {
  const number = generateCertificateNumber();

  assert.match(number, /^CERT-\d{4}-[A-F0-9]{10}$/);
});

test("buildCertificatePdf creates a valid PDF buffer", () => {
  const pdf = buildCertificatePdf({
    certificateNumber: "CERT-2026-ABCDEF1234",
    studentName: "Alex Student",
    courseTitle: "Elite Shooting Fundamentals",
    issuedAt: "2026-02-20",
    brandName: "CTI",
  });

  const asText = pdf.toString("utf8");

  assert.ok(asText.startsWith("%PDF-1.4"));
  assert.match(asText, /Completion Certificate/);
  assert.match(asText, /CERT-2026-ABCDEF1234/);
  assert.match(asText, /%%EOF$/);
});

test("certificate PDF access is denied for non-admins viewing another student's certificate", () => {
  assert.equal(
    canAccessCertificatePdf({
      isBrandAdmin: false,
      customerId: "customer-1",
      certificateCustomerId: "customer-2",
    }),
    false,
  );
});

test("certificate PDF access allows admins and certificate owners", () => {
  assert.equal(
    canAccessCertificatePdf({
      isBrandAdmin: true,
      customerId: null,
      certificateCustomerId: "customer-2",
    }),
    true,
  );

  assert.equal(
    canAccessCertificatePdf({
      isBrandAdmin: false,
      customerId: "customer-2",
      certificateCustomerId: "customer-2",
    }),
    true,
  );
});

test("certificate PDF course lookup scopes by course id without brand filter", () => {
  const calls: Array<[string, string, unknown]> = [];
  const query = {
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return query;
    },
    is(column: string, value: null) {
      calls.push(["is", column, value]);
      return query;
    },
  };

  applyCertificateCourseLookupFilters(query, "course-123");

  assert.deepEqual(calls, [
    ["eq", "id", "course-123"],
    ["is", "deleted_at", null],
  ]);
});

test("verify_certificate_code supports cross-brand certificates by joining course on id only", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260220143000_course_hosting_functions.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");
  const functionStart = sql.indexOf("create or replace function public.verify_certificate_code");
  const functionBodyStart = sql.indexOf("as $$", functionStart);
  const functionBodyEnd = sql.indexOf("$$;", functionBodyStart);

  assert.notEqual(functionStart, -1);
  assert.notEqual(functionBodyStart, -1);
  assert.notEqual(functionBodyEnd, -1);

  const functionBody = sql.slice(functionBodyStart, functionBodyEnd);

  assert.match(functionBody, /on co\.id = cert\.course_id/);
  assert.match(functionBody, /and co\.deleted_at is null/);
  assert.doesNotMatch(functionBody, /co\.brand_id\s*=\s*cert\.brand_id/);
});
