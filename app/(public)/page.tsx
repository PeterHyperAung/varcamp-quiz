import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { CircuitBackground } from "@/components/ui/circuit-background";
import { ScheduleStatusBadge } from "@/components/ui/status-badge";
import { PanelSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { formatEventTimeRange } from "@/lib/validation/events";
import { ManageEvents } from "@/modules/events/application/manage-events";
import { QuizRepository } from "@/modules/quizzes/infrastructure/quiz-repository";

export const metadata = {
  title: "VarCamp — quizzes and event timetable",
};

/**
 * Public homepage.
 *
 * The hero is static and ships in the prerendered shell; both feature lists
 * stream in behind Suspense boundaries. The two features are independent
 * domains — nothing here implies a quiz belongs to an event.
 */
export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="vc-eyebrow">VarCamp 2026</p>
          <h1 className="vc-heading mt-4 max-w-3xl text-4xl sm:text-6xl">
            <span className="vc-text-gradient">Take a quiz.</span>{" "}
            <span className="text-crimson-500">Find an event.</span>
          </h1>
          <p className="vc-body-copy mt-6 max-w-2xl text-base sm:text-lg">
            Open the timetable to see what is coming up, or jump into a quiz.
            Quizzes need no account — you enter a name, answer, and see your
            result straight away.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/quizzes" className="vc-pill-cta">
              Browse quizzes
            </Link>
            <Link href="/events" className="vc-pill-secondary">
              View timetable
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <hr className="vc-rule" />
      </div>

      <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="vc-eyebrow">Timetable</p>
            <h2 className="vc-heading mt-2 text-2xl sm:text-3xl">Next events</h2>
          </div>
          <Link href="/events" className="vc-pill-secondary !py-2 !text-sm">
            Full timetable
          </Link>
        </div>

        <Suspense fallback={<PanelSkeleton rows={3} />}>
          <NextEvents />
        </Suspense>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="vc-eyebrow">Open now</p>
            <h2 className="vc-heading mt-2 text-2xl sm:text-3xl">Available quizzes</h2>
          </div>
          <Link href="/quizzes" className="vc-pill-secondary !py-2 !text-sm">
            All quizzes
          </Link>
        </div>

        <Suspense fallback={<PanelSkeleton rows={3} />}>
          <OpenQuizzes />
        </Suspense>

        <CircuitBackground className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-30" />
      </section>
    </>
  );
}

/** Status is derived from the current time, so this must run at request time. */
async function NextEvents() {
  await connection();

  const { entries } = await new ManageEvents(getDb()).getPublicTimetable({ limit: 3 });

  if (entries.length === 0) {
    return (
      <p className="vc-surface mt-6 p-6 text-center vc-body-copy">
        No events are scheduled right now. Check back soon.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((event) => {
        const when = formatEventTimeRange(event.starts_at, event.ends_at, event.timezone);

        return (
          <li key={event.id} className="vc-surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <ScheduleStatusBadge status={event.scheduleStatus} />
              <time
                className="text-xs font-semibold tracking-wide text-lavender-500"
                dateTime={event.starts_at.toISOString()}
              >
                {when.date}
              </time>
            </div>
            <h3 className="vc-heading mt-3 text-lg">
              <Link href={`/events/${event.public_id}`} className="hover:text-sun-500">
                {event.title}
              </Link>
            </h3>
            <p className="mt-2 text-sm font-semibold text-sun-500">{when.time}</p>
            {event.room_name && event.room_public_id ? (
              <p className="mt-1 break-words text-sm font-semibold text-electric-400">
                Room: <Link
                  href={`/events?room=${encodeURIComponent(event.room_public_id)}`}
                  className="underline-offset-4 hover:underline"
                >
                  {event.room_name}
                </Link>
              </p>
            ) : null}
            {event.location ? (
              <p className="mt-1 break-words text-sm text-lavender-300">{event.location}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

async function OpenQuizzes() {
  await connection();

  const quizzes = await new QuizRepository(getDb()).listPublished({ limit: 3, offset: 0 });

  if (quizzes.length === 0) {
    return (
      <p className="vc-surface mt-6 p-6 text-center vc-body-copy">
        No quizzes are open at the moment.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {quizzes.map((quiz) => (
        <li key={quiz.id} className="vc-surface flex flex-col p-5">
          <h3 className="vc-heading text-lg">
            <Link href={`/quizzes/${quiz.public_id}`} className="hover:text-sun-500">
              {quiz.title}
            </Link>
          </h3>
          {quiz.description ? (
            <p className="vc-body-copy mt-2 flex-1 text-sm">{quiz.description}</p>
          ) : (
            <div className="flex-1" />
          )}
          <Link href={`/quizzes/${quiz.public_id}`} className="vc-pill-cta mt-5 !py-2.5 !text-sm">
            Start quiz
          </Link>
        </li>
      ))}
    </ul>
  );
}
