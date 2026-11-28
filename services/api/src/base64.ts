import { Refusal } from "./refusal.js";

const CANONICAL = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Decodes standard base64 and refuses anything that is not its one canonical form. Node's own decoder
 * skips characters it does not know and stops at stray padding, so a damaged file would otherwise
 * be stored as quietly different bytes. `what` names the file in the refusal.
 */
export function strictBase64(raw: unknown, what: string): Buffer {
  if (typeof raw !== "string" || raw.length % 4 !== 0 || !CANONICAL.test(raw)) {
    throw new Refusal(400, "invalid", `${what} is not valid base64`);
  }
  const bytes = Buffer.from(raw, "base64");
  if (bytes.toString("base64") !== raw) throw new Refusal(400, "invalid", `${what} is not valid base64`);
  return bytes;
}
