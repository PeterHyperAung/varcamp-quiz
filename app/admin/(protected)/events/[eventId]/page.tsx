import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PublicationButton } from "@/components/ui/publication-button";
import { PublicationStatusBadge, ScheduleStatusBadge } from "@/components/ui/status-badge";
import { DetailSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { NotFoundError } from "@/lib/errors";
import { formatEventTimeRange } from "@/lib/validation/events";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { setEventPublicationAction } from "@/modules/events/presentation/actions";
import { EventForm } from "@/modules/events/presentation/event-form";

export const metadata = {
  title: "Event editor · Admin",
};

const TIMEZONES = [
  "Asia/Yangon",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

interface AdminEventPageProps {
  params: Promise<{ eventId: string }>;
}

export default function AdminEventPage({ params }: AdminEventPageProps) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<DetailSkeleton />}>
        <EventEditor params={params} />
      </Suspense>
    </div>
  );
}

async function EventEditor({ params }: AdminEventPageProps) {
  await connection();

  const { eventId } = await params;

  const manage = new ManageEvents(getDb());
  const event = await manage.getForAdmin(eventId).catch((error) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });

  if (!event) notFound();

  const rooms = await manage.listRoomsForAdmin();
  const when = formatEventTimeRange(event.starts_at, event.ends_at, event.timezone);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="vc-heading text-3xl">{event.title}</h1>
            <PublicationStatusBadge status={event.publication_status} />
            <ScheduleStatusBadge status={event.scheduleStatus} />
            {event.room_name ? (
              <span className="vc-pill !py-1 !text-xs">{event.room_name}</span>
            ) : null}
          </div>
          <p className="vc-field-hint mt-1">
            {when.date} · {when.time} · {event.timezone}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {event.publication_status !== "published" ? (
            <PublicationButton
              action={setEventPublicationAction}
              entityId={event.id}
              entityIdField="eventId"
              label="Publish"
              pendingLabel="Publishing…"
              tone="primary"
              extraFields={{ publicationStatus: "published" }}
            />
          ) : (
            <PublicationButton
              action={setEventPublicationAction}
              entityId={event.id}
              entityIdField="eventId"
              label="Unpublish"
              pendingLabel="Unpublishing…"
              extraFields={{ publicationStatus: "draft" }}
            />
          )}

          {event.publication_status !== "archived" ? (
            <PublicationButton
              action={setEventPublicationAction}
              entityId={event.id}
              entityIdField="eventId"
              label="Archive"
              pendingLabel="Archiving…"
              tone="danger"
              extraFields={{ publicationStatus: "archived" }}
            />
          ) : null}

          {event.publication_status === "published" ? (
            <Link
              href={`/events/${event.public_id}`}
              className="vc-pill-secondary !py-2 !text-sm"
            >
              View public page
            </Link>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="edit-heading" className="vc-surface p-6">
        <h2 id="edit-heading" className="vc-heading text-xl">
          Edit event
        </h2>
        <p className="vc-field-hint mt-1">
          Public link: <code className="break-all text-lavender-300">/events/{event.public_id}</code>
        </p>
        <div className="mt-5">
          <EventForm
            event={event}
            rooms={rooms}
            defaultTimezone={event.timezone}
            timezones={TIMEZONES}
          />
        </div>
      </section>
    </>
  );
}
