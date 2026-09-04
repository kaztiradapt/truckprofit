export function safeInternalRedirectPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/\p{Cc}/u.test(value)) return null;
  return value;
}
