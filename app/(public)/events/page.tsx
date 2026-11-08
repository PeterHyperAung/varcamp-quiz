import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ScheduleStatusBadge } from "@/components/ui/status-badge";
import { ListSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { formatEventTimeRange } from "@/lib/validation/events";
import { ManageEvents } from "@/modules/events/application/manage-events";

export const metadata = {
  title: "Event timetable",
};

const PAGE_SIZE = 20;

/**
 * The public timetable.
 *
 * Room links are shareable filters, so each room has a dedicated timetable
 * without introducing a relationship to the quiz domain.
 */
export default function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; room?: string }>;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <p className="vc-eyebrow">Timetable</p>
        <h1 className="vc-heading mt-3 text-3xl sm:text-5xl">Event schedule</h1>
        <p className="vc-body-copy mt-4">
          All times are shown in the event&rsquo;s own timezone, labelled on each
          entry. Choose a room to see its dedicated schedule. Status is derived
          from the current time.
        </p>
      </header>

      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Timetable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Timetable({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; room?: string }>;
}) {
  await connection();

  const { page: pageParam, room: roomParam } = await searchParams;
  const manage = new ManageEvents(getDb());
  const page = Math.max(1, Number(pageParam) || 1);
  const rooms = await manage.listPublicRooms();
  const selectedRoom = rooms.find((room) => room.publicId === roomParam) ?? null;

  const { entries, total } = await manage.getPublicTimetable({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    roomPublicId: selectedRoom?.publicId,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const groups = (
    [
      { key: "ongoing", heading: "Happening now", entries },
      { key: "upcoming", heading: "Coming up", entries },
      { key: "ended", heading: "Finished", entries },
    ] as const
  )
    .map((group) => ({
      key: group.key,
      heading: group.heading,
      entries: entries.filter((event) => event.scheduleStatus === group.key),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <>
      {rooms.length > 0 ? (
        <nav className="mt-7 flex flex-wrap gap-2" aria-label="Timetable by room">
          <Link
            href="/events"
            className={selectedRoom ? "vc-pill-secondary !py-2 !text-sm" : "vc-pill-cta !py-2 !text-sm"}
            aria-current={!selectedRoom ? "page" : undefined}
          >
            All rooms
          </Link>
          {rooms.map((room) => {
            const isSelected = selectedRoom?.publicId === room.publicId;

            return (
              <Link
                key={room.publicId}
                href={`/events?room=${encodeURIComponent(room.publicId)}`}
                className={isSelected ? "vc-pill-cta !py-2 !text-sm" : "vc-pill-secondary !py-2 !text-sm"}
                aria-current={isSelected ? "page" : undefined}
              >
                {room.name}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {selectedRoom ? (
        <div className="mt-7 vc-surface-raised p-5">
          <p className="vc-eyebrow">Room timetable</p>
          <h2 className="vc-heading mt-2 text-2xl">{selectedRoom.name}</h2>
          <p className="vc-field-hint mt-2">
            Published events scheduled in this room.
          </p>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="vc-surface mt-10 p-10 text-center">
          <p className="vc-heading text-xl">
            {selectedRoom ? `No events scheduled in ${selectedRoom.name}` : "No events scheduled"}
          </p>
          <p className="vc-body-copy mt-2">
            {selectedRoom
              ? "Published events assigned to this room will appear here."
              : "Nothing is on the calendar right now. New events appear here as soon as they are published."}
          </p>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`group-${group.key}`}>
              <h2 id={`group-${group.key}`} className="vc-heading text-xl sm:text-2xl">
                {group.heading}
              </h2>

              <ul className="mt-4 space-y-4">
                {group.entries.map((event) => {
                  const when = formatEventTimeRange(event.starts_at, event.ends_at, event.timezone);

                  return (
                    <li key={event.id} className="vc-surface p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <ScheduleStatusBadge status={event.scheduleStatus} />
                        <time
                          className="text-sm font-semibold text-lavender-100"
                          dateTime={event.starts_at.toISOString()}
                        >
                          {when.date}
                        </time>
                        <span className="text-xs font-semibold uppercase tracking-wider text-lavender-500">
                          {event.timezone}
                        </span>
                      </div>

                      <h3 className="vc-heading mt-3 text-xl">
                        <Link href={`/events/${event.public_id}`} className="hover:text-sun-500">
                          {event.title}
                        </Link>
                      </h3>

                      {event.room_name ? (
                        <p className="mt-2 break-words text-sm font-semibold text-electric-400">
                          Room: {event.room_public_id ? (
                            <Link
                              href={`/events?room=${encodeURIComponent(event.room_public_id)}`}
                              className="underline-offset-4 hover:underline"
                            >
                              {event.room_name}
                            </Link>
                          ) : event.room_name}
                        </p>
                      ) : null}

                      <p className="mt-2 font-semibold text-sun-500">{when.time}</p>

                      {event.location ? (
                        <p className="mt-1 break-words text-sm text-lavender-300">{event.location}</p>
                      ) : null}

                      {event.description ? (
                        <p className="vc-body-copy mt-3 text-sm">{event.description}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {totalPages > 1 ? (
            <nav aria-label="Timetable pagination" className="flex flex-wrap gap-3 pt-2">
              {page > 1 ? (
                <Link
                  href={timetableHref(page - 1, selectedRoom?.publicId)}
                  className="vc-pill-secondary"
                >
                  Previous
                </Link>
              ) : null}
              <span className="vc-pill !cursor-default">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={timetableHref(page + 1, selectedRoom?.publicId)}
                  className="vc-pill-secondary"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      )}
    </>
  );
}

function timetableHref(page: number, roomPublicId?: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (roomPublicId) params.set("room", roomPublicId);
  return `/events?${params.toString()}`;
}
