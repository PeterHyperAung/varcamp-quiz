import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { PublicationStatusBadge } from "@/components/ui/status-badge";
import { ListSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";
import { CreateQuizForm } from "@/modules/quizzes/presentation/create-quiz-form";

export const metadata = {
  title: "Quizzes · Admin",
};

const PAGE_SIZE = 20;

interface AdminQuizzesPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

export default function AdminQuizzesPage({ searchParams }: AdminQuizzesPageProps) {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="vc-heading text-3xl">Quizzes</h1>
          <p className="vc-body-copy mt-2 text-sm">
            Create, edit and publish quizzes. Published content is frozen so past
            results never change.
          </p>
        </div>
      </header>

      <section aria-labelledby="create-heading" className="vc-surface p-6">
        <h2 id="create-heading" className="vc-heading text-xl">
          New quiz
        </h2>
        <div className="mt-5">
          <CreateQuizForm />
        </div>
      </section>

      <Suspense fallback={<ListSkeleton rows={4} />}>
        <QuizList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuizList({
  searchParams,
}: {
  searchParams: AdminQuizzesPageProps["searchParams"];
}) {
  await connection();

  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const manage = new ManageQuizzes(getDb());
  const { rows, total } = await manage.listForAdmin({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: q,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      {/* The search field needs `searchParams`, so it lives behind the boundary
          with the results it filters. */}
      <form method="get" className="flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="q">
          Search quizzes
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by title…"
          className="vc-field max-w-xs"
        />
        <button type="submit" className="vc-pill-secondary !py-2.5 !text-sm">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="vc-surface p-8 text-center vc-body-copy">
          No quizzes found. Create one above.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((quiz) => (
            <li
              key={quiz.id}
              className="vc-surface flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/quizzes/${quiz.id}`}
                    className="break-words font-display text-lg font-bold hover:text-sun-500"
                  >
                    {quiz.title}
                  </Link>
                  <PublicationStatusBadge status={quiz.publication_status} />
                </div>
                <p className="vc-field-hint">
                  {quiz.attempt_count} submission{quiz.attempt_count === 1 ? "" : "s"}
                  {" · "}public link{" "}
                  <code className="text-lavender-300">/quizzes/{quiz.public_id}</code>
                </p>
              </div>

              <Link
                href={`/admin/quizzes/${quiz.id}`}
                className="vc-pill-secondary !py-2 !text-sm"
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Quiz pagination" className="flex flex-wrap gap-3">
          {page > 1 ? (
            <Link
              href={`/admin/quizzes?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="vc-pill-secondary !py-2 !text-sm"
            >
              Previous
            </Link>
          ) : null}
          <span className="vc-pill !py-2 !text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/admin/quizzes?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="vc-pill-secondary !py-2 !text-sm"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
