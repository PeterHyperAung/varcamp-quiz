import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";

export const metadata = {
  title: "Admin dashboard",
};

/** Landing page for administrators. Access is gated by the protected layout. */
export default function AdminDashboardPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="vc-heading text-3xl">Dashboard</h1>
        <p className="vc-body-copy mt-2">
          Quizzes and events are independent features; manage each in its own
          section.
        </p>
      </div>

      <Suspense fallback={<ListSkeleton rows={3} />}>
        <DashboardSummary />
      </Suspense>
    </div>
  );
}

/** Reads live data, so it renders per request rather than being prerendered. */
async function DashboardSummary() {
  await connection();

  const db = getDb();

  const [{ rows: quizzes }, { rows: events, total: eventCount }] = await Promise.all([
    new ManageQuizzes(db).listForAdmin({ limit: 5, offset: 0 }),
    new ManageEvents(db).listForAdmin({ limit: 5, offset: 0 }),
  ]);

  const publishedQuizzes = quizzes.filter(
    (quiz) => quiz.publication_status === "published",
  ).length;

  return (
    <>
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="vc-heading text-xl">
          At a glance
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="vc-surface p-5">
            <dt className="vc-eyebrow">Quizzes shown</dt>
            <dd className="vc-heading mt-2 text-3xl">{quizzes.length}</dd>
            <p className="vc-field-hint">{publishedQuizzes} published</p>
          </div>
          <div className="vc-surface p-5">
            <dt className="vc-eyebrow">Events</dt>
            <dd className="vc-heading mt-2 text-3xl">{eventCount}</dd>
            <p className="vc-field-hint">Total scheduled</p>
          </div>
          <div className="vc-surface p-5">
            <dt className="vc-eyebrow">Quick actions</dt>
            <dd className="mt-3 flex flex-col gap-2">
              <Link href="/admin/quizzes" className="vc-pill-secondary !py-2 !text-sm">
                Manage quizzes
              </Link>
              <Link href="/admin/events" className="vc-pill-secondary !py-2 !text-sm">
                Manage events
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="vc-heading text-xl">
          Recently updated quizzes
        </h2>
        {quizzes.length === 0 ? (
          <p className="vc-surface mt-4 p-6 vc-body-copy">No quizzes yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {quizzes.map((quiz) => (
              <li
                key={quiz.id}
                className="vc-surface flex min-w-0 flex-wrap items-center justify-between gap-3 p-4"
              >
                <Link
                  href={`/admin/quizzes/${quiz.id}`}
                  className="min-w-0 flex-1 break-words font-semibold hover:text-sun-500"
                >
                  {quiz.title}
                </Link>
                <span className="shrink-0 text-sm text-lavender-300">
                  {quiz.attempt_count} submissions
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className="vc-heading text-xl">
          Next events
        </h2>
        {events.length === 0 ? (
          <p className="vc-surface mt-4 p-6 vc-body-copy">No events scheduled.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="vc-surface flex min-w-0 flex-wrap items-center justify-between gap-3 p-4"
              >
                <Link
                  href={`/admin/events/${event.id}`}
                  className="min-w-0 flex-1 break-words font-semibold hover:text-sun-500"
                >
                  {event.title}
                </Link>
                <span className="max-w-full break-words text-sm text-lavender-300">{event.timezone}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
