/**
 * The VarCamp flame mark, redrawn as a simple SVG so it stays crisp and
 * inherits the theme colours.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        width="30"
        height="34"
        viewBox="0 0 30 34"
        role="img"
        aria-label="VarCamp"
        className="shrink-0"
      >
        <path
          d="M15 1c1.6 5.4-2.2 6.6-4.4 9.4C8.3 12.8 6 15 6 19a9 9 0 0 0 18 0c0-5.4-4-8-6.6-11.8C16 5 15.6 3.2 15 1Z"
          fill="var(--color-crimson-500)"
        />
        <path
          d="M15 12.5c.9 3-1.2 3.7-2.4 5.2-.9 1.2-1.6 2.3-1.6 3.6a4 4 0 0 0 8 0c0-2.2-1.8-3.3-3-5.2-.8-1.2-1-2.6-1-3.6Z"
          fill="var(--color-navy-950)"
          opacity="0.35"
        />
        <text
          x="15"
          y="26"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="800"
          fontSize="13"
          fill="#ffffff"
        >
          V
        </text>
      </svg>
      <span className="font-display text-xl font-extrabold tracking-tight">VARCAMP</span>
    </span>
  );
}