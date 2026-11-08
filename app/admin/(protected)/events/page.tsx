import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PublicationStatusBadge, ScheduleStatusBadge } from "@/components/ui/status-badge";
import { ListSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { formatEventTimeRange } from "@/lib/validation/events";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { EventForm } from "@/modules/events/presentation/event-form";
import { RoomForm } from "@/modules/events/presentation/room-form";

export const metadata = {
  title: "Events · Admin",
};

const PAGE_SIZE = 20;

/**
 * A short, curated list of zones rather than every IANA identifier, which would
 * be unusable in a select control. The server still validates against the full
 * IANA set.
 */
const COMMON_TIMEZONES = [
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

interface AdminEventsPageProps {
  searchParams: Promise<{ page?: string; tz?: string }>;
}

export default function AdminEventsPage({ searchParams }: AdminEventsPageProps) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="vc-heading text-3xl">Events</h1>
        <p className="vc-body-copy mt-2 text-sm">
          Events are an independent feature of the platform. Times are stored in
          UTC and displayed in each event&rsquo;s own timezone.
        </p>
      </header>

      <Suspense fallback={<ListSkeleton rows={4} />}>
        <EventAdminBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EventAdminBody({ searchParams }: { searchParams: AdminEventsPageProps["searchParams"] }) {
  await connection();

  const { page: pageParam, tz } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const defaultTimezone = tz ?? "Asia/Yangon";

  const manage = new ManageEvents(getDb());
  const [{ rows, total }, rooms] = await Promise.all([
    manage.listForAdmin({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    manage.listRoomsForAdmin(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <section aria-labelledby="create-heading" className="vc-surface p-6">
        <h2 id="create-heading" className="vc-heading text-xl">
          New event
        </h2>
        <div className="mt-5">
          <EventForm
            rooms={rooms}
            defaultTimezone={defaultTimezone}
            timezones={COMMON_TIMEZONES}
          />
        </div>
      </section>

      <section aria-labelledby="rooms-heading" className="vc-surface p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="vc-eyebrow">Timetable setup</p>
            <h2 id="rooms-heading" className="vc-heading mt-2 text-xl">
              Rooms
            </h2>
          </div>
          <p className="vc-field-hint">Each room gets its own public timetable.</p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <RoomForm />
          {rooms.length === 0 ? (
            <p className="vc-surface-raised p-5 vc-body-copy">
              No rooms yet. Create one, then assign events to it above.
            </p>
          ) : (
            <ul className="space-y-3">
              {rooms.map((room) => (
                <li key={room.publicId} className="vc-surface-raised p-4">
                  <RoomForm room={room} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="vc-surface p-8 text-center vc-body-copy">No events yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((event) => {
            const when = formatEventTimeRange(
              event.starts_at,
              event.ends_at,
              event.timezone,
            );

            return (
              <li
                key={event.id}
                className="vc-surface flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="break-words font-display text-lg font-bold hover:text-sun-500"
                    >
                      {event.title}
                    </Link>
                    <PublicationStatusBadge status={event.publication_status} />
                    <ScheduleStatusBadge status={event.scheduleStatus} />
                    {event.room_name ? (
                      <span className="vc-pill !py-1 !text-xs">{event.room_name}</span>
                    ) : null}
                  </div>
                  <p className="vc-field-hint">
                    {when.date} · {when.time} · {event.timezone}
                  </p>
                </div>

                <Link
                  href={`/admin/events/${event.id}`}
                  className="vc-pill-secondary !py-2 !text-sm"
                >
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Event pagination" className="flex flex-wrap gap-3">
          {page > 1 ? (
            <Link href={`/admin/events?page=${page - 1}`} className="vc-pill-secondary !py-2 !text-sm">
              Previous
            </Link>
          ) : null}
          <span className="vc-pill !py-2 !text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/admin/events?page=${page + 1}`} className="vc-pill-secondary !py-2 !text-sm">
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
