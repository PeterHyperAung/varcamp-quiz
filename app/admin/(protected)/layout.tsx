import type { ReactNode } from "react";
import Link from "next/link";
import { Suspense } from "react";

import { logoutAction } from "@/modules/admin-auth/presentation/actions";
import { requireAdminSession } from "@/modules/admin-auth/presentation/session";

/**
 * Authorization gate for every administrative page.
 *
 * The session is verified on the server before anything renders; hiding an
 * admin link is never treated as authorization. The check reads a cookie, so it
 * sits behind a Suspense boundary and the rest of the shell stays prerenderable.
 */
export default function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[70vh] flex-col">
      <Suspense fallback={<div className="mb-8 h-10" aria-hidden="true" />}>
        <AdminNav />
      </Suspense>

      {children}
    </div>
  );
}

async function AdminNav() {
  // Redirects to the login page when there is no valid session, so an
  // unauthenticated visitor never reaches the page body.
  const session = await requireAdminSession();

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <nav aria-label="Admin sections">
        <ul className="flex flex-wrap gap-2 text-sm font-semibold">
          <li>
            <Link href="/admin" className="vc-pill !py-2">
              Dashboard
            </Link>
          </li>
          <li>
            <Link href="/admin/quizzes" className="vc-pill !py-2">
              Quizzes
            </Link>
          </li>
          <li>
            <Link href="/admin/events" className="vc-pill !py-2">
              Events
            </Link>
          </li>
        </ul>
      </nav>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-lavender-300 sm:inline">{session.name}</span>
        <form action={logoutAction}>
          <button type="submit" className="vc-pill-secondary !py-2 !text-sm">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}