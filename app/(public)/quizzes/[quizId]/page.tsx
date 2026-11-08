import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { DetailSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { systemClock } from "@/lib/clock";
import { TakeQuiz } from "@/modules/quiz-attempts/application/take-quiz";
import { QuizTakingForm } from "@/modules/quiz-attempts/presentation/quiz-taking-form";

interface PublicQuizPageProps {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ attempt?: string; error?: string }>;
}

/**
 * The public quiz page.
 *
 * Correct answers are never serialised into this page: the repository strips
 * `isCorrect` before the data leaves the server, and scoring re-reads the
 * published version from the database on submission.
 */
export default function PublicQuizPage({
  params,
  searchParams,
}: PublicQuizPageProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Suspense fallback={<DetailSkeleton />}>
        <QuizIntro params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuizIntro({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ attempt?: string; error?: string }>;
}) {
  await connection();

  const [{ quizId }, query] = await Promise.all([params, searchParams]);

  const takeQuiz = new TakeQuiz(getDb());

  const quiz = await takeQuiz.getPublicQuiz(quizId);
  if (!quiz) notFound();

  // An attempt link in the URL resumes an in-progress attempt. A submitted
  // attempt redirects to its result page instead of re-rendering the form.
  let attemptPublicId: string | null = null;
  let participantName: string | null = null;
  let initialElapsedMs = 0;

  if (query.attempt) {
    const attempt = await takeQuiz.getAttempt(query.attempt);

    // The attempt must belong to the quiz on this page, otherwise an attempt
    // link would render an unrelated quiz's questions.
    if (attempt && attempt.quiz_id === quiz.quizId) {
      if (attempt.status === "submitted") {
        redirect(`/quizzes/${quizId}/result/${attempt.public_id}`);
      }

      attemptPublicId = attempt.public_id;
      participantName = attempt.participant_name;
      initialElapsedMs = Math.max(0, systemClock.now().getTime() - attempt.started_at.getTime());
    }
  }

  return (
    <>
      <p className="vc-eyebrow">Quiz</p>
      <h1 className="vc-heading mt-3 text-3xl sm:text-5xl">{quiz.title}</h1>

      {quiz.description ? <p className="vc-body-copy mt-4">{quiz.description}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {quiz.passingScore !== null ? (
          <span className="vc-pill !py-1.5 !text-sm">Pass mark: {quiz.passingScore}%</span>
        ) : null}
        {quiz.certificateEnabled ? (
          <span className="vc-pill !py-1.5 !text-sm">Certificate on pass</span>
        ) : null}
      </div>

      {quiz.instructions ? (
        <div className="vc-surface mt-8 p-6">
          <h2 className="vc-eyebrow">Instructions</h2>
          <div className="mt-3 whitespace-pre-line vc-body-copy text-sm">
            {quiz.instructions}
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <QuizTakingForm
          quiz={quiz}
          quizPublicId={quizId}
          attemptPublicId={attemptPublicId}
          participantName={participantName}
          initialElapsedMs={initialElapsedMs}
          errorMessage={query.error ?? null}
        />
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/quizzes" className="vc-pill-secondary">
          Back to quizzes
        </Link>
        <Link
          href={`/quizzes/${quizId}/leaderboard`}
          className="vc-pill-secondary"
        >
          View leaderboard
        </Link>
      </div>
    </>
  );
}
