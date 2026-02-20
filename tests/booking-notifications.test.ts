import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  sendBookingCreationNotifications,
  sendBookingReminderNotification,
} from "@/lib/bookings/notifications";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

test("booking creation notifications send email and SMS when providers are configured", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "bookings@example.com";
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_FROM_NUMBER = "+15550001111";

  const calls: Array<{ url: string; method: string }> = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: String(init?.method ?? "GET"),
    });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const result = await sendBookingCreationNotifications(
    {
      brandName: "CTI",
      instructorName: "Instructor One",
      studentName: "Student One",
      startAt: "2026-03-02T15:00:00.000Z",
      studentTimezone: "America/New_York",
      studentEmail: "student@example.com",
      studentPhone: "+15550002222",
    },
    fetchFn,
  );

  assert.equal(result.emailSent, true);
  assert.equal(result.smsSent, true);
  assert.equal(result.warnings.length, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.some((call) => call.url.includes("api.resend.com/emails")));
  assert.ok(calls.some((call) => call.url.includes("api.twilio.com/2010-04-01/Accounts/AC123/Messages.json")));
});

test("booking creation notifications degrade to email-only when Twilio is missing", async () => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "bookings@example.com";
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;

  const fetchFn = (async () => new Response("{}", { status: 200 })) as typeof fetch;

  const result = await sendBookingCreationNotifications(
    {
      brandName: "CTI",
      instructorName: "Instructor One",
      studentName: "Student One",
      startAt: "2026-03-02T15:00:00.000Z",
      studentTimezone: "America/New_York",
      studentEmail: "student@example.com",
      studentPhone: "+15550002222",
    },
    fetchFn,
  );

  assert.equal(result.emailSent, true);
  assert.equal(result.smsSent, false);
  assert.ok(result.warnings.some((warning) => warning.includes("Twilio is not configured")));
});

test("reminder notifications skip SMS when student phone is missing", async () => {
  const result = await sendBookingReminderNotification(
    {
      brandName: "CTI",
      instructorName: "Instructor One",
      studentName: "Student One",
      startAt: "2026-03-02T15:00:00.000Z",
      studentTimezone: "America/New_York",
      studentPhone: null,
    },
    (async () => new Response("{}", { status: 200 })) as typeof fetch,
  );

  assert.equal(result.smsSent, false);
  assert.ok(result.warnings.some((warning) => warning.includes("missing")));
});
