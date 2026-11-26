import { audit } from "./db";
import type { Result } from "./connect-api";
import { no, ok } from "./grow-core";
import type { StaffRecord } from "./seed/staff";

/**
 * Staff signatures, used on Grow certificates (docs/API.md §16).
 * Each person keeps one, drawn or uploaded on My signature. The browser trims
 * it and sends a PNG, so it stays small. A real backend would keep the file in
 * storage and hand out its URL; the mock keeps the data URL itself.
 */

/** About 220 KB of PNG once base64 is decoded. */
export const SIGNATURE_MAX_CHARS = 300_000;

/** An error message, or null when the image is fine. */
export function checkSignature(v: unknown): string | null {
  if (typeof v !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)) return "Draw or upload the signature again (PNG or JPEG)";
  if (v.length > SIGNATURE_MAX_CHARS) return "That image is too large. Try a smaller scan";
  return null;
}

export function mySignature(u: StaffRecord): Result<{ signature: string | null }> {
  return ok({ signature: u.signature });
}

export function saveMySignature(u: StaffRecord, body: { signature?: unknown }): Result<{ signature: string }> {
  const bad = checkSignature(body.signature);
  if (bad) return no(422, "VALIDATION_FAILED", bad, { signature: [bad] });
  const replaced = !!u.signature;
  u.signature = body.signature as string;
  audit(u.id, "account.signature.save", u.id, { after: { replaced } });
  return ok({ signature: u.signature });
}

export function removeMySignature(u: StaffRecord): Result<{ signature: null }> {
  if (u.signature) audit(u.id, "account.signature.remove", u.id);
  u.signature = null;
  return ok({ signature: null });
}
