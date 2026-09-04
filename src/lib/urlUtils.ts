/**
 * URL sanitization utilities for safe external link handling.
 * Enforces strict HTTP and HTTPS protocol schemes, neutralizing javascript:,
 * data:, vbscript:, and relative or malformed URI attack vectors.
 */
export function safeExternalHref(href?: string): string | undefined {
  if (!href) return undefined;

  const trimmed = href.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}
