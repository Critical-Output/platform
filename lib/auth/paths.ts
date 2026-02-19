export const normalizeRedirectPath = (
  value: string | null | undefined,
  fallback = "/profile",
): string => {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
};

export const hasAuthStatusQuery = (searchParams: URLSearchParams): boolean =>
  searchParams.has("error") || searchParams.has("success");
