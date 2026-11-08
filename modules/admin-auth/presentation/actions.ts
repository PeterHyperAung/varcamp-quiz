"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getDb } from "@/lib/db/client";
import { authenticate } from "@/modules/admin-auth/application/authenticate";
import {
  endAdminSession,
  startAdminSession,
} from "@/modules/admin-auth/presentation/session";
import { toActionState, type ActionState } from "@/lib/forms";

/**
 * Logs an administrator in.
 *
 * This is a public entry point: the client may call it directly with any
 * payload, so the input is validated, the attempt is throttled and the session
 * cookie is written only after a verified credential check.
 */
export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      "unknown";

    const session = await authenticate(
      {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        ipAddress,
      },
      getDb(),
    );

    await startAdminSession(session);
  } catch (error) {
    return toActionState(error, "login");
  }

  redirect("/admin");
}

/** Clears the session cookie. */
export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect("/admin/login");
}