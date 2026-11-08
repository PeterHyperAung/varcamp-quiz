import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifySessionToken,
  type AdminSession,
} from "../infrastructure/session-token";

/**
 * Reads and verifies the admin session on the server.
 *
 * Every admin page and mutation calls one of these helpers; authorization is
 * never inferred from whether an admin link is visible in the UI.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifySessionToken(token);
}

/** Redirects unauthenticated visitors to the login page. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}

export async function startAdminSession(session: AdminSession): Promise<void> {
  const { createSessionToken } = await import("../infrastructure/session-token");

  (await cookies()).set(SESSION_COOKIE_NAME, await createSessionToken(session), {
    ...sessionCookieOptions,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  });
}

export { getDb };