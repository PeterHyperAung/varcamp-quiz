import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { DetailSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { TakeQuiz } from "@/modules/quiz-attempts/application/take-quiz";
import { QuizRepository } from "@/modules/quizzes/infrastructure/quiz-repository";
import { ElapsedTime } from "@/components/ui/elapsed-time";
import { LeaderboardTable } from "@/modules/quiz-attempts/presentation/leaderboard-table";

interface ResultPageProps {
  params: Promise<{ quizId: string; attemptId: string }>;
}

/**
 * Public result page, reached through the opaque attempt link.
 *
 * This is the only place correct answers are revealed, and only after a
 * submitted result exists. It is deliberately request-time and uncached because
 * it carries participant information.
 */
export default function AttemptResultPage({ params }: ResultPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Suspense fallback={<DetailSkeleton />}>
        <Result params={params} />
      </Suspense>
    </div>
  );
}

async function Result({ params }: { params: ResultPageProps["params"] }) {
  await connection();

  const { quizId, attemptId } = await params;

  const db = getDb();
  const takeQuiz = new TakeQuiz(db);

  // Keep the attempt link scoped to the quiz it belongs to.
  const attempt = await takeQuiz.getAttempt(attemptId);
  const quiz = await new QuizRepository(db).findByPublicId(quizId);
  if (!attempt || !quiz || attempt.quiz_id !== quiz.id) notFound();

  const result = await takeQuiz.getResult(attemptId).catch(() => null);
  if (!result) notFound();

  const leaderboard = await takeQuiz.getLeaderboard(attempt.quiz_id, attemptId);

  return (
    <>
      <p className="vc-eyebrow">Your result</p>
      <h1 className="vc-heading mt-3 text-3xl sm:text-4xl">{result.quizTitle}</h1>

      <div className="vc-surface mt-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm text-lavender-300">
              {result.participantName
                ? `Result for ${result.participantName}`
                : "Your score"}
            </p>
            <p className="vc-heading mt-1 text-4xl sm:text-5xl">
              {result.score}
              <span className="text-lavender-500"> / {result.maxScore}</span>
            </p>
            <p className="mt-2 text-sm text-lavender-300">
              Time: <ElapsedTime initialElapsedMs={result.elapsedMs} />
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="vc-heading text-3xl text-sun-500">
              {result.percentage.toFixed(0)}%
            </p>
            <p
              className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                result.passed
                  ? "border-sun-500 text-sun-500 bg-sun-500/15"
                  : "border-outline-500 text-lavender-300 bg-navy-700/60"
              }`}
            >
              {/* Glyph plus label: state is never signalled by colour alone. */}
              <span aria-hidden="true">{result.passed ? "●" : "○"}</span>
              {result.passed ? "Passed" : "Not passed"}
            </p>
          </div>
        </div>

        {result.passingScore !== null ? (
          <p className="vc-field-hint mt-4">
            The passing score for this quiz is {result.passingScore}%.
          </p>
        ) : null}

        {result.certificate ? (
          <div className="vc-surface-raised mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">Your certificate is ready</p>
              <p className="vc-field-hint break-words">
                Keep this link private — anyone with it can view the certificate.
              </p>
            </div>
            <a
              href={`/certificates/${result.certificate.public_id}`}
              className="vc-pill-cta shrink-0 !py-2.5 !text-sm"
            >
              View certificate
            </a>
          </div>
        ) : null}
      </div>

      <section className="mt-10" aria-labelledby="review-heading">
        <h2 id="review-heading" className="vc-heading text-xl">
          Answer review
        </h2>

        <ol className="mt-4 space-y-4">
          {result.review.map((item, index) => (
            <li key={item.questionId} className="vc-surface p-5">
              <p className="vc-heading text-base">
                <span className="mr-2 text-crimson-500">{index + 1}.</span>
                {item.prompt}
              </p>

              <div className="mt-3 space-y-1.5 text-sm">
                <p
                  className={
                    item.correct
                      ? "font-semibold text-sun-500"
                      : "font-semibold text-magenta-400"
                  }
                >
                  <span aria-hidden="true">{item.correct ? "✓" : "✗"}</span>{" "}
                  {item.correct ? "Correct" : "Incorrect"}
                </p>
                {item.correct ? null : (
                    <p className="break-words text-lavender-300">
                    Your answer: {item.selectedLabel ?? "No answer"}
                  </p>
                )}
                <p className="break-words text-lavender-300">
                  Correct answer: {item.correctLabel ?? "—"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="leaderboard-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="vc-eyebrow">Quiz leaderboard</p>
            <h2 id="leaderboard-heading" className="vc-heading mt-2 text-xl">
              {leaderboard.currentPlayer
                ? `Your rank: #${leaderboard.currentPlayer.rank}`
                : "Leaderboard"}
            </h2>
          </div>
          {quiz.publication_status === "published" ? (
            <Link href={`/quizzes/${quizId}/leaderboard`} className="vc-pill-secondary !py-2.5 !text-sm">
              Full leaderboard
            </Link>
          ) : null}
        </div>
        <LeaderboardTable
          entries={
            leaderboard.currentPlayer && leaderboard.currentPlayer.rank > 10
              ? [...leaderboard.entries.slice(0, 10), leaderboard.currentPlayer]
              : leaderboard.entries.slice(0, 10)
          }
          currentPlayer={leaderboard.currentPlayer}
        />
        {leaderboard.currentPlayer && leaderboard.currentPlayer.rank > 10 ? (
          <p className="vc-field-hint mt-3">
            Your place is #{leaderboard.currentPlayer.rank}; the table above shows the top 10.
          </p>
        ) : null}
      </section>

      <div className="mt-10">
        <Link href="/quizzes" className="vc-pill-secondary">
          Back to quizzes
        </Link>
      </div>
    </>
  );
}
