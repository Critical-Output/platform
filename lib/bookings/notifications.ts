import { formatDateTimeForZone } from "./scheduling";

export type NotificationChannel = "sms" | "email";
export type NotificationProvider = "twilio" | "resend" | "internal";
export type NotificationStatus = "sent" | "failed" | "skipped";

export type NotificationResult = {
  channel: NotificationChannel;
  provider: NotificationProvider;
  status: NotificationStatus;
  providerMessageId?: string;
  error?: string;
};

type SendSmsInput = {
  to: string;
  body: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export const sendTwilioSms = async (input: SendSmsInput): Promise<NotificationResult> => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    return {
      channel: "sms",
      provider: "twilio",
      status: "skipped",
      error: "Twilio environment variables are not fully configured.",
    };
  }

  const params = new URLSearchParams({
    To: input.to,
    From: fromNumber,
    Body: input.body,
  });

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (error) {
    return {
      channel: "sms",
      provider: "twilio",
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to reach Twilio API.",
    };
  }

  if (!response.ok) {
    const responseBody = await response.text();
    return {
      channel: "sms",
      provider: "twilio",
      status: "failed",
      error: `Twilio API error (${response.status}): ${responseBody.slice(0, 200)}`,
    };
  }

  const payload = (await response.json()) as { sid?: string };
  return {
    channel: "sms",
    provider: "twilio",
    status: "sent",
    providerMessageId: payload.sid,
  };
};

export const sendResendEmail = async (input: SendEmailInput): Promise<NotificationResult> => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !fromEmail) {
    return {
      channel: "email",
      provider: "resend",
      status: "failed",
      error: "Resend environment variables are not fully configured.",
    };
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
  } catch (error) {
    return {
      channel: "email",
      provider: "resend",
      status: "failed",
      error: error instanceof Error ? error.message : "Failed to reach Resend API.",
    };
  }

  if (!response.ok) {
    const responseBody = await response.text();
    return {
      channel: "email",
      provider: "resend",
      status: "failed",
      error: `Resend API error (${response.status}): ${responseBody.slice(0, 200)}`,
    };
  }

  const payload = (await response.json()) as { id?: string };
  return {
    channel: "email",
    provider: "resend",
    status: "sent",
    providerMessageId: payload.id,
  };
};

type CreatedNotificationInput = {
  studentEmail?: string | null;
  studentPhone?: string | null;
  instructorName?: string | null;
  startAt: Date;
  studentTimeZone: string;
};

export const sendBookingCreatedNotifications = async (
  input: CreatedNotificationInput,
): Promise<{
  email: NotificationResult | null;
  sms: NotificationResult | null;
  smsBlocker?: string;
}> => {
  const startLabel = formatDateTimeForZone(input.startAt, input.studentTimeZone);
  const instructorLabel = input.instructorName?.trim() ? ` with ${input.instructorName.trim()}` : "";

  let emailResult: NotificationResult | null = null;
  if (input.studentEmail?.trim()) {
    const subject = "Booking confirmed";
    const text = `Your 1:1 coaching booking${instructorLabel} is set for ${startLabel}.`;
    emailResult = await sendResendEmail({
      to: input.studentEmail.trim(),
      subject,
      text,
      html: `<p>Your 1:1 coaching booking${instructorLabel} is set for <strong>${startLabel}</strong>.</p>`,
    });
  }

  let smsResult: NotificationResult | null = null;
  let smsBlocker: string | undefined;
  if (input.studentPhone?.trim()) {
    smsResult = await sendTwilioSms({
      to: input.studentPhone.trim(),
      body: `Booking confirmed${instructorLabel}. Time: ${startLabel}.`,
    });

    if (smsResult.status !== "sent") {
      smsBlocker = smsResult.error ?? "Twilio SMS failed; email-only fallback applied.";
    }
  }

  return {
    email: emailResult,
    sms: smsResult,
    smsBlocker,
  };
};

type ReminderNotificationInput = {
  studentEmail?: string | null;
  studentPhone?: string | null;
  instructorName?: string | null;
  startAt: Date;
  studentTimeZone: string;
};

export const sendBookingReminder24hNotification = async (
  input: ReminderNotificationInput,
): Promise<{
  sms: NotificationResult | null;
  emailFallback: NotificationResult | null;
  smsBlocker?: string;
}> => {
  const startLabel = formatDateTimeForZone(input.startAt, input.studentTimeZone);
  const instructorLabel = input.instructorName?.trim() ? ` with ${input.instructorName.trim()}` : "";

  let smsResult: NotificationResult | null = null;
  let smsBlocker: string | undefined;

  if (input.studentPhone?.trim()) {
    smsResult = await sendTwilioSms({
      to: input.studentPhone.trim(),
      body: `Reminder: your coaching session${instructorLabel} starts in 24h (${startLabel}).`,
    });

    if (smsResult.status !== "sent") {
      smsBlocker = smsResult.error ?? "Twilio SMS reminder failed.";
    }
  } else {
    smsBlocker = "Student phone not available for SMS reminder.";
  }

  let fallbackEmail: NotificationResult | null = null;
  if (smsResult?.status !== "sent" && input.studentEmail?.trim()) {
    fallbackEmail = await sendResendEmail({
      to: input.studentEmail.trim(),
      subject: "Reminder: coaching session in 24 hours",
      text: `Reminder: your coaching session${instructorLabel} starts in 24 hours at ${startLabel}.`,
      html: `<p>Reminder: your coaching session${instructorLabel} starts in 24 hours at <strong>${startLabel}</strong>.</p>`,
    });
  }

  return {
    sms: smsResult,
    emailFallback: fallbackEmail,
    smsBlocker,
  };
};
