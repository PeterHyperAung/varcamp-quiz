/**
 * Decorative "circuit" line work drawn from `theme.png`.
 *
 * Purely ornamental: hidden from assistive technology and never interactive.
 */
export function CircuitBackground({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <g
        fill="none"
        strokeWidth="1.5"
        stroke="currentColor"
        strokeLinecap="square"
      >
        <path d="M40 700 H260 V520 H470" stroke="var(--color-magenta-500)" opacity="0.5" />
        <path d="M470 520 V330 H640" stroke="var(--color-crimson-500)" opacity="0.45" />
        <path d="M640 330 H820 V470 H1010" stroke="var(--color-electric-500)" opacity="0.5" />
        <path d="M1010 470 V700 H1170" stroke="var(--color-magenta-500)" opacity="0.4" />
        <path d="M160 800 V640 H420 V560" stroke="var(--color-electric-500)" opacity="0.4" />
        <path d="M700 800 V620 H880 V560" stroke="var(--color-crimson-500)" opacity="0.35" />
        <path d="M980 800 V660 H1130 V600" stroke="var(--color-electric-500)" opacity="0.35" />
        <path d="M1180 300 H1010 V170 H860" stroke="var(--color-electric-500)" opacity="0.45" />
        <path d="M860 170 V90 H980" stroke="var(--color-crimson-500)" opacity="0.45" />
      </g>

      <g>
        {(
          [
            [40, 700, "var(--color-magenta-500)", 11],
            [260, 520, "var(--color-electric-500)", 13],
            [470, 330, "var(--color-crimson-500)", 14],
            [640, 330, "var(--color-electric-500)", 11],
            [820, 470, "var(--color-crimson-500)", 12],
            [1010, 470, "var(--color-magenta-500)", 13],
            [1010, 170, "var(--color-electric-500)", 12],
            [860, 170, "var(--color-crimson-500)", 13],
            [470, 640, "var(--color-magenta-500)", 11],
            [640, 620, "var(--color-electric-500)", 12],
            [820, 620, "var(--color-magenta-500)", 11],
            [1010, 660, "var(--color-electric-500)", 13],
          ] as ReadonlyArray<readonly [number, number, string, number]>
        ).map(([cx, cy, fill, size]) => (
          <rect
            key={`${cx}-${cy}`}
            x={cx - size / 2}
            y={cy - size / 2}
            width={size}
            height={size}
            fill={fill}
            opacity="0.85"
          />
        ))}
      </g>
    </svg>
  );
}

/** The equaliser bar strip along the bottom edge of the reference poster. */
export function SpectrumBars({ className }: { className?: string }) {
  const heights = [
    18, 34, 12, 44, 26, 38, 16, 30, 48, 22, 36, 14, 42, 28, 20, 46, 24, 32, 40,
    18, 28, 44, 22, 36, 16, 40, 26, 34, 20, 46, 24, 30,
  ];

  const colours = [
    "var(--color-crimson-500)",
    "var(--color-magenta-500)",
    "var(--color-electric-500)",
  ];

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "100%" }}
    >
      {heights.map((height, index) => (
        <span
          key={index}
          style={{
            width: 6,
            height,
            backgroundColor: colours[index % colours.length],
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  );
}