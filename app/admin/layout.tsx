import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/ui/brand-mark";

/**
 * Admin shell.
 *
 * Deliberately minimal: this layout wraps the login page too, so it must not
 * assume the visitor is authenticated. Authorization lives in the
 * `(protected)` group layout.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-navy-950">
      <header className="border-b border-outline-500/40 bg-navy-900">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/admin" aria-label="VarCamp admin">
            <BrandMark />
          </Link>
          <span className="vc-eyebrow">Admin</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        {children}
      </main>
    </div>
  );
}