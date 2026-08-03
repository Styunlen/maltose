/**
 * Sanitize a redirect target to prevent open redirect attacks.
 * Only allows same-origin relative paths (starting with `/`, not `//`).
 * Returns `/` for any invalid input.
 */
export function sanitizeReturnTo(returnTo: string): string {
  if (!returnTo) return "/";
  if (!returnTo.startsWith("/")) return "/";
  if (returnTo.startsWith("//")) return "/";
  // Reject control characters
  if (/[\u0000-\u001f\u007f]/.test(returnTo)) return "/";
  return returnTo;
}
