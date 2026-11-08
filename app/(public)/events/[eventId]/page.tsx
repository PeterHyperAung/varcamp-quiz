import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { ScheduleStatusBadge } from "@/components/ui/status-badge";
import { DetailSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { formatEventTimeRange } from "@/lib/validation/events";
import { ManageEvents } from "@/modules/events/application/manage-events";

interface PublicEventPageProps {
  params: Promise<{ eventId: string }>;
}

/**
 * A single public event.
 *
 * Unpublished and archived events are indistinguishable from missing ones, so a
 * draft link can never be probed. Status is resolved at request time.
 */
export default function PublicEventPage({ params }: PublicEventPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Suspense fallback={<DetailSkeleton />}>
        <EventDetail params={params} />
      </Suspense>
    </div>
  );
}

async function EventDetail({ params }: { params: Promise<{ eventId: string }> }) {
  await connection();

  const { eventId } = await params;

  const event = await new ManageEvents(getDb()).getPublicEvent(eventId);

  if (!event) notFound();

  const when = formatEventTimeRange(event.starts_at, event.ends_at, event.timezone);

  return (
    <>
      <ScheduleStatusBadge status={event.scheduleStatus} />

      <h1 className="vc-heading mt-4 text-3xl sm:text-5xl">{event.title}</h1>

      <dl className="vc-surface mt-8 grid gap-5 p-6 sm:grid-cols-2">
        <div>
          <dt className="vc-eyebrow">Date</dt>
          <dd className="mt-1 break-words font-semibold">
            <time dateTime={event.starts_at.toISOString()}>{when.date}</time>
          </dd>
        </div>
        <div>
          <dt className="vc-eyebrow">Time</dt>
          <dd className="mt-1 break-words font-semibold">{when.time}</dd>
        </div>
        <div>
          <dt className="vc-eyebrow">Timezone</dt>
          <dd className="mt-1 break-words font-semibold">{event.timezone}</dd>
        </div>
        <div>
          <dt className="vc-eyebrow">Room</dt>
          <dd className="mt-1 break-words font-semibold">
            {event.room_name && event.room_public_id ? (
              <Link
                href={`/events?room=${encodeURIComponent(event.room_public_id)}`}
                className="text-electric-400 underline-offset-4 hover:underline"
              >
                {event.room_name} timetable
              </Link>
            ) : (
              event.room_name ?? "To be announced"
            )}
          </dd>
        </div>
        <div>
          <dt className="vc-eyebrow">Location details</dt>
          <dd className="mt-1 break-words font-semibold">{event.location ?? "—"}</dd>
        </div>
      </dl>

      {event.description ? (
        <div className="mt-8 whitespace-pre-line vc-body-copy">{event.description}</div>
      ) : null}
    </>
  );
}
