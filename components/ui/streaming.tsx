import type { ReactNode } from "react";

/**
 * Fallbacks used while request-time content streams in.
 *
 * Every one of these sits behind a `<Suspense>` boundary so the prerendered
 * shell can still ship. The shapes mirror the real content closely enough that
 * the transition does not shift the layout.
 */

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="vc-surface h-40 animate-pulse" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="mt-6 space-y-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="vc-surface h-32 animate-pulse" />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 space-y-6">
      <div className="vc-surface h-10 w-2/3 animate-pulse" />
      <div className="vc-surface h-56 w-full animate-pulse" />
      <div className="vc-surface h-8 w-1/2 animate-pulse" />
    </div>
  );
}

/**
 * Announces to assistive technology that content is arriving.
 *
 * `aria-busy` plus a polite live region, so the skeleton is not just silent
 * decoration for screen-reader users either.
 */
export function StreamingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}