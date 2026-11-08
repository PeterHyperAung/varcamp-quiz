import "server-only";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { getServerEnv } from "@/lib/config/env";

export const SESSION_COOKIE_NAME = "vc_admin_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export interface AdminSession {
  administratorId: string;
  email: string;
  name: string;
}

const sessionPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.email(),
  name: z.string().min(1),
});

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getServerEnv().SESSION_SECRET);
}

/**
 * Signs the admin session cookie.
 *
 * A signed, self-contained token keeps authorisation checks free of extra
 * database round-trips on every admin page render; the cookie itself is
 * HttpOnly + Secure + SameSite=Lax so scripts cannot read it.
 */
export async function createSessionToken(session: AdminSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ email: session.email, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.administratorId)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_DURATION_SECONDS)
    .setIssuer("varcamp")
    .setAudience("varcamp-admin")
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "varcamp",
      audience: "varcamp-admin",
      algorithms: ["HS256"],
    });

    const parsed = sessionPayloadSchema.safeParse(payload);
    if (!parsed.success) return null;

    return {
      administratorId: parsed.data.sub,
      email: parsed.data.email,
      name: parsed.data.name,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
} as const;