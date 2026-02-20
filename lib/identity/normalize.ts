const MAX_IDENTIFIER_LENGTH = 200;

const normalizeBoundedString = (value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) return null;
  return trimmed;
};

export const normalizeUserId = (value: unknown): string | null => normalizeBoundedString(value);

export const normalizeAnonymousId = (value: unknown): string | null => normalizeBoundedString(value);

export const normalizeDeviceFingerprint = (value: unknown): string | null =>
  normalizeBoundedString(value);

export const normalizeEmail = (value: unknown): string | null => {
  const normalized = normalizeBoundedString(value, 320);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  if (!lower.includes("@")) return null;

  return lower;
};

export const normalizePhone = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 20) return null;

  return digits;
};

export const formatClickHouseTimestamp = (date = new Date()): string => {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
};
