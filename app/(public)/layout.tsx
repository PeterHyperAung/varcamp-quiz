import type { ReactNode } from "react";

import { SiteFooter, SiteHeader } from "@/components/layout/site-chrome";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}