"use client";

import { useEffect, useState } from "react";
import { formatElapsedTime } from "@/lib/format-time";

/** A live elapsed-time display; the server remains authoritative for ranking. */
export function ElapsedTime({
  initialElapsedMs,
  running = false,
}: {
  initialElapsedMs: number;
  running?: boolean;
}) {
  const [elapsedMs, setElapsedMs] = useState(initialElapsedMs);

  useEffect(() => {
    if (!running) return;

    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      setElapsedMs(initialElapsedMs + performance.now() - startedAt);
    }, 250);

    return () => window.clearInterval(interval);
  }, [initialElapsedMs, running]);

  const displayedElapsedMs = running ? elapsedMs : initialElapsedMs;

  return (
    <time className="font-mono tabular-nums" aria-label={`Elapsed time ${formatElapsedTime(displayedElapsedMs)}`}>
      {formatElapsedTime(displayedElapsedMs)}
    </time>
  );
}
