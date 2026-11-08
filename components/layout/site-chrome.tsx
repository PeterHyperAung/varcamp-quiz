import Link from "next/link";

import { BrandMark } from "@/components/ui/brand-mark";
import { SpectrumBars } from "@/components/ui/circuit-background";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-outline-500/40 bg-navy-950/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:flex-nowrap sm:px-8">
        <Link href="/" className="shrink-0" aria-label="VarCamp home">
          <BrandMark />
        </Link>

        <nav className="ml-auto w-full sm:ml-0 sm:w-auto" aria-label="Main">
          <ul className="flex flex-wrap items-center justify-end gap-1 text-sm font-semibold sm:justify-start">
            <li>
              <Link
                href="/events"
                className="rounded-full px-3 py-2 text-lavender-100 transition-colors hover:bg-navy-700 hover:text-white sm:px-4"
              >
                Timetable
              </Link>
            </li>
            <li>
              <Link
                href="/quizzes"
                className="rounded-full px-3 py-2 text-lavender-100 transition-colors hover:bg-navy-700 hover:text-white sm:px-4"
              >
                Quizzes
              </Link>
            </li>
            <li>
              <Link href="/admin" className="vc-pill-secondary !px-4 !py-2 !text-sm">
                Admin
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-outline-500/40 bg-navy-900">
      <SpectrumBars className="h-12 w-full opacity-70" />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <BrandMark className="text-base" />
          <p className="vc-body-copy !text-sm">
            Quizzes and events are independent features of the VarCamp platform.
          </p>
        </div>
      </div>
    </footer>
  );
}
