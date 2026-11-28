/**
 * Links whose address comes from the server or from GitHub. Only an https address opens, so a
 * javascript:, data: or other scheme is never a link (review WEB-26). A caller shows the text
 * without a link when these return undefined.
 */

/** An absolute https address, or undefined. */
export function httpsHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.host !== "" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A path on this site ("/packages/WP-1/runs/R-1/log") or an https address, or undefined. A path
 * that starts with "//" or "/\" would reach another host, so it is refused.
 */
export function sitePathOrHttpsHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
    // Control characters and whitespace can make a browser read the path differently.
    if (/[\u0000- \u007f\\]/.test(value)) return undefined;
    return value;
  }
  return httpsHref(value);
}
