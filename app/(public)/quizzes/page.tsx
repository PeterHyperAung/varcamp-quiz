import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PanelSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { QuizRepository } from "@/modules/quizzes/infrastructure/quiz-repository";

export const metadata = {
  title: "Quizzes",
};

/** Public quiz directory. Only published quizzes are listed. */
export default function QuizzesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="max-w-2xl">
        <p className="vc-eyebrow">Quizzes</p>
        <h1 className="vc-heading mt-3 text-3xl sm:text-5xl">Open quizzes</h1>
        <p className="vc-body-copy mt-4">
          No account needed. Open a quiz, answer, and your result appears
          immediately.
        </p>
      </header>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <QuizList />
      </Suspense>
    </div>
  );
}

async function QuizList() {
  await connection();

  const quizzes = await new QuizRepository(getDb()).listPublished({ limit: 50, offset: 0 });

  if (quizzes.length === 0) {
    return (
      <div className="vc-surface mt-10 p-10 text-center">
        <p className="vc-heading text-xl">No quizzes are open</p>
        <p className="vc-body-copy mt-2">
          Quizzes appear here once an organiser publishes them.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2">
      {quizzes.map((quiz) => (
          <li key={quiz.id} className="vc-surface flex flex-col p-6">
          <h2 className="vc-heading text-xl">
            <Link href={`/quizzes/${quiz.public_id}`} className="hover:text-sun-500">
              {quiz.title}
            </Link>
          </h2>
          {quiz.description ? (
            <p className="vc-body-copy mt-2 flex-1 text-sm">{quiz.description}</p>
          ) : (
            <div className="flex-1" />
          )}
          <Link
            href={`/quizzes/${quiz.public_id}`}
            className="vc-pill-cta mt-5 !py-2.5 !text-sm"
          >
            Start quiz
          </Link>
          <Link
            href={`/quizzes/${quiz.public_id}/leaderboard`}
            className="vc-pill-secondary mt-3 !py-2.5 !text-sm"
          >
            Leaderboard
          </Link>
        </li>
      ))}
    </ul>
  );
}
