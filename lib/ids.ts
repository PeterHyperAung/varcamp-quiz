import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford-ish, no i/l/o/u

/**
 * Generates an opaque, URL-safe public identifier.
 *
 * Public quiz links, attempt links and certificate links are bearer
 * credentials, so they must not expose sequential database ids. 16 chars of a
 * 32-symbol alphabet is ~80 bits of entropy.
 */
export function generatePublicId(length = 16): string {
  const bytes = randomBytes(length);

  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

const PUBLIC_ID_PATTERN = new RegExp(`^[${ALPHABET}]{8,32}$`);

export function isPublicId(value: string): boolean {
  return PUBLIC_ID_PATTERN.test(value);
}