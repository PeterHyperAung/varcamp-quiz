import type { EventScheduleStatus } from "@/modules/events/domain/schedule";
import type { PublicationStatus } from "@/lib/db/types";

/**
 * Status badges pair a colour with a text label and a distinct glyph, so state
 * is never communicated by colour alone.
 */

const SCHEDULE_PRESENTATION: Record<
  EventScheduleStatus,
  { label: string; className: string; glyph: string }
> = {
  upcoming: {
    label: "Upcoming",
    className: "border-electric-500 text-electric-400 bg-electric-500/12",
    glyph: "◷",
  },
  ongoing: {
    label: "Ongoing",
    className: "border-sun-500 text-sun-500 bg-sun-500/15",
    glyph: "●",
  },
  ended: {
    label: "Ended",
    className: "border-outline-500 text-lavender-300 bg-navy-700/60",
    glyph: "✓",
  },
};

export function ScheduleStatusBadge({
  status,
}: {
  status: EventScheduleStatus;
}) {
  const presentation = SCHEDULE_PRESENTATION[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${presentation.className}`}
    >
      <span aria-hidden="true">{presentation.glyph}</span>
      {presentation.label}
    </span>
  );
}

const PUBLICATION_PRESENTATION: Record<PublicationStatus, string> = {
  published: "border-electric-500 text-electric-400 bg-electric-500/12",
  draft: "border-sun-500 text-sun-500 bg-sun-500/15",
  archived: "border-outline-500 text-lavender-300 bg-navy-700/60",
};

export function PublicationStatusBadge({
  status,
}: {
  status: PublicationStatus;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${PUBLICATION_PRESENTATION[status]}`}
    >
      <span aria-hidden="true">{status === "published" ? "●" : status === "draft" ? "◐" : "■"}</span>
      {status}
    </span>
  );
}