import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCertificatePdf, generateCertificateCode } from "../lib/courses/certificates";

const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const findBytes = (haystack: Uint8Array, needle: Uint8Array, start = 0): number => {
  if (needle.length === 0) return start;
  for (let offset = start; offset <= haystack.length - needle.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return offset;
  }
  return -1;
};

test("generateCertificateCode returns CERT-prefixed uppercase token", () => {
  const code = generateCertificateCode();
  assert.match(code, /^CERT-[A-Z0-9]{12}$/);
});

test("buildCertificatePdf returns a PDF payload", () => {
  const pdf = buildCertificatePdf({
    studentName: "Jane Student",
    courseTitle: "Advanced Sporting Clays",
    issuedAt: "2026-02-20T00:00:00.000Z",
    verificationCode: "CERT-ABC123DEF456",
    brandName: "CTI",
  });

  const text = new TextDecoder().decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  const streamStart = text.indexOf("stream\n");
  const streamEnd = text.indexOf("\nendstream", streamStart);
  assert.notEqual(streamStart, -1);
  assert.notEqual(streamEnd, -1);

  const contentStream = text.slice(streamStart + "stream\n".length, streamEnd);
  assert.equal((contentStream.match(/\bTm\b/g) ?? []).length, 7);
  assert.doesNotMatch(contentStream, /\bTd\b/);
  assert.match(contentStream, /1 0 0 1 100 700 Tm/);
  assert.match(contentStream, /\(Certificate of Completion\) Tj/);
  assert.match(contentStream, /1 0 0 1 150 455 Tm/);
  assert.match(contentStream, /\(Verification Code: CERT-ABC123DEF456\) Tj/);
});

test("buildCertificatePdf maintains byte-accurate stream lengths and xref offsets with utf-8 text", () => {
  const pdf = buildCertificatePdf({
    studentName: "Jos\u00E9 \u5B66\u751F",
    courseTitle: "Introducci\u00F3n \u00E0 la s\u00E9curit\u00E9",
    issuedAt: "2026-02-20T00:00:00.000Z",
    verificationCode: "CERT-ABC123DEF456",
    brandName: "Caf\u00E9 Internacional",
  });

  const text = new TextDecoder().decode(pdf);
  const lengthMatch = text.match(/\/Length (\d+)/);
  assert.ok(lengthMatch);

  const streamPrefix = encodeUtf8("stream\n");
  const streamSuffix = encodeUtf8("\nendstream");
  const streamStart = findBytes(pdf, streamPrefix);
  assert.notEqual(streamStart, -1);

  const streamContentStart = streamStart + streamPrefix.length;
  const streamEnd = findBytes(pdf, streamSuffix, streamContentStart);
  assert.notEqual(streamEnd, -1);
  assert.equal(streamEnd - streamContentStart, Number(lengthMatch[1]));

  const xrefOffsetMatch = text.match(/startxref\n(\d+)\n%%EOF$/);
  assert.ok(xrefOffsetMatch);

  const xrefOffset = Number(xrefOffsetMatch[1]);
  assert.equal(findBytes(pdf, encodeUtf8("xref\n")), xrefOffset);

  const offsetMatches = Array.from(text.matchAll(/(\d{10}) 00000 n \n/g));
  assert.equal(offsetMatches.length, 5);

  const objectSignatures = ["1 0 obj", "2 0 obj", "3 0 obj", "4 0 obj", "5 0 obj"];
  for (let index = 0; index < objectSignatures.length; index += 1) {
    const offset = Number(offsetMatches[index]?.[1] ?? "0");
    assert.equal(findBytes(pdf, encodeUtf8(objectSignatures[index]), offset), offset);
  }
});
