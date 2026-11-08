import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PanelSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { TakeQuiz } from "@/modules/quiz-attempts/application/take-quiz";
import { LeaderboardTable } from "@/modules/quiz-attempts/presentation/leaderboard-table";

interface LeaderboardPageProps {
  params: Promise<{ quizId: string }>;
}

export const metadata = { title: "Leaderboard" };

export default function QuizLeaderboardPage({ params }: LeaderboardPageProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <Suspense fallback={<PanelSkeleton rows={6} />}>
        <Leaderboard params={params} />
      </Suspense>
    </div>
  );
}

async function Leaderboard({ params }: { params: LeaderboardPageProps["params"] }) {
  await connection();

  const { quizId } = await params;
  const takeQuiz = new TakeQuiz(getDb());
  const quiz = await takeQuiz.getPublicQuiz(quizId);
  if (!quiz) notFound();

  const leaderboard = await takeQuiz.getLeaderboard(quiz.quizId);

  return (
    <>
      <p className="vc-eyebrow">Leaderboard</p>
      <h1 className="vc-heading mt-3 text-3xl sm:text-5xl">{quiz.title}</h1>
      <p className="vc-body-copy mt-4">
        Highest score percentage ranks first; ties are ordered by the fastest
        server-recorded completion time. Showing the top 100 submitted attempts.
      </p>
      <div className="mt-8">
        <LeaderboardTable entries={leaderboard.entries} />
      </div>
      <Link href={`/quizzes/${quizId}`} className="vc-pill-secondary mt-8">
        Back to quiz
      </Link>
    </>
  );
}
