import { formatDateInTimeZone, isValidIanaTimeZone } from "@/lib/bookings/utils";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const RESEND_EMAIL_API = "https://api.resend.com/emails";

type FetchLike = typeof fetch;

type BookingNotificationPayload = {
  brandName: string;
  instructorName: string;
  studentName: string;
  startAt: string;
  studentTimezone: string;
  studentEmail?: string | null;
  studentPhone?: string | null;
};

type ReminderNotificationPayload = {
  brandName: string;
  instructorName: string;
  studentName: string;
  startAt: string;
  studentTimezone: string;
  studentPhone?: string | null;
};

export type NotificationResult = {
  emailSent: boolean;
  smsSent: boolean;
  warnings: string[];
};

const normalizeRecipient = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveDisplayTime = (startAt: string, requestedTimezone: string): string => {
  const fallbackTimezone = "UTC";
  const timeZone = isValidIanaTimeZone(requestedTimezone) ? requestedTimezone : fallbackTimezone;
  return formatDateInTimeZone(startAt, timeZone);
};

const sendEmail = async (
  to: string,
  subject: string,
  text: string,
  html: string,
  fetchFn: FetchLike,
): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY?.trim() || process.env.RESEND_SMTP_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    throw new Error("Resend is not configured (RESEND_API_KEY/RESEND_SMTP_KEY + RESEND_FROM_EMAIL)");
  }

  const response = await fetchFn(RESEND_EMAIL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${body}`);
  }
};

const sendSms = async (
  to: string,
  body: string,
  fetchFn: FetchLike,
): Promise<void> => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio is not configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)");
  }

  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const formData = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  const response = await fetchFn(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Twilio request failed: ${response.status} ${responseBody}`);
  }
};

export const sendBookingCreationNotifications = async (
  payload: BookingNotificationPayload,
  fetchFn: FetchLike = fetch,
): Promise<NotificationResult> => {
  const warnings: string[] = [];
  let emailSent = false;
  let smsSent = false;

  const studentEmail = normalizeRecipient(payload.studentEmail);
  const studentPhone = normalizeRecipient(payload.studentPhone);
  const startsAtLabel = resolveDisplayTime(payload.startAt, payload.studentTimezone);

  if (studentEmail) {
    const subject = `${payload.brandName}: Coaching session booked`;
    const text = [
      `Hi ${payload.studentName},`,
      "",
      `Your 1:1 coaching session with ${payload.instructorName} is booked for ${startsAtLabel}.`,
      "",
      `Brand: ${payload.brandName}`,
    ].join("\n");

    const html = `<p>Hi ${payload.studentName},</p><p>Your 1:1 coaching session with <strong>${payload.instructorName}</strong> is booked for <strong>${startsAtLabel}</strong>.</p><p>Brand: ${payload.brandName}</p>`;

    try {
      await sendEmail(studentEmail, subject, text, html, fetchFn);
      emailSent = true;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Email confirmation failed");
    }
  } else {
    warnings.push("Student email is missing; skipped email confirmation");
  }

  if (studentPhone) {
    const message = `Booking confirmed: ${payload.brandName} with ${payload.instructorName} on ${startsAtLabel}.`;

    try {
      await sendSms(studentPhone, message, fetchFn);
      smsSent = true;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "SMS confirmation failed");
    }
  } else {
    warnings.push("Student phone is missing; skipped SMS confirmation");
  }

  return { emailSent, smsSent, warnings };
};

export const sendBookingReminderNotification = async (
  payload: ReminderNotificationPayload,
  fetchFn: FetchLike = fetch,
): Promise<NotificationResult> => {
  const warnings: string[] = [];
  let smsSent = false;

  const studentPhone = normalizeRecipient(payload.studentPhone);
  if (!studentPhone) {
    warnings.push("Student phone is missing; skipped reminder SMS");
    return { emailSent: false, smsSent: false, warnings };
  }

  const startsAtLabel = resolveDisplayTime(payload.startAt, payload.studentTimezone);
  const message = `Reminder: ${payload.brandName} session with ${payload.instructorName} starts at ${startsAtLabel}.`;

  try {
    await sendSms(studentPhone, message, fetchFn);
    smsSent = true;
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Reminder SMS failed");
  }

  return { emailSent: false, smsSent, warnings };
};
