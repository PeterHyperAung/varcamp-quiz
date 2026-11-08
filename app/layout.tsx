import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Noto_Sans_Myanmar, Poppins } from "next/font/google";

import { CircuitBackground } from "@/components/ui/circuit-background";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Poppins carries the heavy geometric display voice of `theme.png`; Noto Sans
 * Myanmar is loaded because the reference poster is bilingual and public copy
 * is published in Burmese as well as English.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const notoSansMyanmar = Noto_Sans_Myanmar({
  variable: "--font-noto-myanmar",
  subsets: ["myanmar"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "VarCamp",
    template: "%s · VarCamp",
  },
  description:
    "VarCamp public site: the event timetable and open quizzes. Take a quiz without an account, see your result, and download your certificate.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} ${notoSansMyanmar.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col overflow-x-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            background:
              "radial-gradient(120% 80% at 85% 0%, #200762 0%, #090a4b 45%, #000137 100%)",
          }}
        />
        <CircuitBackground className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-45" />
        {children}
      </body>
    </html>
  );
}
