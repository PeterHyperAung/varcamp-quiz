import "server-only";

import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/**
 * Compares a candidate password against a stored hash.
 *
 * `bcrypt.compare` performs a constant-time comparison internally. Callers must
 * not short-circuit on an unknown email: `authenticate` below always runs a
 * comparison so that response timing does not reveal which accounts exist.
 */
export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

/** A dummy hash used to equalise timing for unknown accounts. */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7Qq7lS9JkRv1D3h0O3zvKz1UwGq9e1K";

export async function burnPasswordComparison(): Promise<void> {
  await bcrypt.compare("not-a-real-password", DUMMY_HASH).catch(() => false);
}