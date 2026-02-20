import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  sendBookingCreatedNotifications,
  sendBookingReminder24hNotification,
  sendResendEmail,
  sendTwilioSms,
} from "../lib/bookings/notifications";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

test("sendTwilioSms returns skipped when Twilio is not configured", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;

  const result = await sendTwilioSms({
    to: "+15555550123",
    body: "hello",
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.provider, "twilio");
});

test("sendResendEmail fails when Resend is not configured", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;

  const result = await sendResendEmail({
    to: "student@example.com",
    subject: "test",
    text: "body",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.provider, "resend");
});

test("sendBookingCreatedNotifications exposes sms blocker when Twilio is unavailable", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;

  const result = await sendBookingCreatedNotifications({
    studentEmail: "student@example.com",
    studentPhone: "+15555550123",
    instructorName: "Coach One",
    startAt: new Date("2026-03-10T14:00:00.000Z"),
    studentTimeZone: "America/New_York",
  });

  assert.equal(Boolean(result.smsBlocker), true);
  assert.equal(result.sms?.status, "skipped");
});

test("sendBookingReminder24hNotification falls back to email path when SMS cannot be sent", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;

  const result = await sendBookingReminder24hNotification({
    studentEmail: "student@example.com",
    studentPhone: "+15555550123",
    instructorName: "Coach One",
    startAt: new Date("2026-03-10T14:00:00.000Z"),
    studentTimeZone: "America/New_York",
  });

  assert.equal(result.sms?.status, "skipped");
  assert.equal(result.emailFallback?.provider, "resend");
  assert.equal(result.emailFallback?.status, "failed");
});
