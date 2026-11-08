import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { PublicationButton } from "@/components/ui/publication-button";
import { PublicationStatusBadge } from "@/components/ui/status-badge";
import { DetailSkeleton } from "@/components/ui/streaming";
import { getDb } from "@/lib/db/client";
import { NotFoundError } from "@/lib/errors";
import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";
import {
  QuizDetailsForm,
  QuizSettingsForm,
} from "@/modules/quizzes/presentation/quiz-forms";
import {
  QuestionAdminActions,
  QuestionForm,
} from "@/modules/quizzes/presentation/question-editor";
import {
  archiveQuizAction,
  publishQuizAction,
  restoreQuizAction,
  unpublishQuizAction,
} from "@/modules/quizzes/presentation/actions";
import { TakeQuiz } from "@/modules/quiz-attempts/application/take-quiz";

export const metadata = {
  title: "Quiz editor · Admin",
};

interface AdminQuizPageProps {
  params: Promise<{ quizId: string }>;
}

export default function AdminQuizPage({ params }: AdminQuizPageProps) {
  return (
    <div className="space-y-10">
      <Suspense fallback={<DetailSkeleton />}>
        <QuizEditor params={params} />
      </Suspense>
    </div>
  );
}

async function QuizEditor({ params }: AdminQuizPageProps) {
  await connection();

  const { quizId } = await params;
  const db = getDb();
  const manage = new ManageQuizzes(db);

  const detail = await manage.getForEditing(quizId).catch((error) => {
    if (error instanceof NotFoundError) return null;
    throw error;
  });

  if (!detail) notFound();

  const { quiz, editableVersion, publishedVersion, questions } = detail;
  const displayVersion = editableVersion ?? publishedVersion;
  if (!displayVersion) notFound();

  const isReadOnly = quiz.publication_status !== "draft";

  // Recent submissions give the administrator immediate feedback.
  const { rows: attempts } = await new TakeQuiz(db).listSubmittedForQuiz(quizId, {
    limit: 5,
    offset: 0,
  });

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="vc-heading text-3xl">{quiz.title}</h1>
            <PublicationStatusBadge status={quiz.publication_status} />
          </div>
          <p className="vc-field-hint mt-1">
            {quiz.publication_status === "published"
              ? editableVersion
                ? `Published v${publishedVersion?.version ?? "?"} is live · draft v${editableVersion.version} is locked until you unpublish.`
                : `Published v${publishedVersion?.version ?? "?"} is read-only. Unpublish to edit.`
              : quiz.publication_status === "archived"
                ? "Archived quiz is read-only. Restore it as a draft to edit."
                : `Editing draft v${editableVersion?.version ?? "?"}${publishedVersion ? ` · previous published v${publishedVersion.version} is frozen` : " · not published yet"}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {quiz.publication_status === "published" ? (
            <>
              <PublicationButton
                action={unpublishQuizAction}
                entityId={quizId}
                entityIdField="quizId"
                label="Unpublish"
                pendingLabel="Unpublishing…"
              />
              <PublicationButton
                action={archiveQuizAction}
                entityId={quizId}
                entityIdField="quizId"
                label="Archive"
                pendingLabel="Archiving…"
                tone="danger"
                confirmMessage="Archive this quiz? The public link stops working, but results and certificates are kept."
              />
            </>
          ) : quiz.publication_status === "archived" ? (
            <PublicationButton
              action={restoreQuizAction}
              entityId={quizId}
              entityIdField="quizId"
              label="Restore as draft"
              pendingLabel="Restoring…"
            />
          ) : (
            <PublicationButton
              action={publishQuizAction}
              entityId={quizId}
              entityIdField="quizId"
              label="Publish"
              pendingLabel="Publishing…"
              tone="primary"
            />
          )}

          {quiz.publication_status === "published" ? (
            <Link
              href={`/quizzes/${quiz.public_id}`}
              className="vc-pill-secondary !py-2 !text-sm"
            >
              View public page
            </Link>
          ) : null}
        </div>
      </header>

      <div className="vc-surface-raised p-4 text-sm">
        <strong>Public link:</strong>{" "}
          <code className="break-all text-lavender-300">/quizzes/{quiz.public_id}</code>
        <p className="vc-field-hint mt-1">
          Share this link with participants. It works for anyone — no account
          required.
        </p>
      </div>

      {isReadOnly ? (
        <p role="status" className="vc-surface-raised border-l-4 border-l-sun-500 p-4">
          {quiz.publication_status === "published"
            ? "This quiz is live and read-only. Unpublish it before changing details, settings, or questions. Existing attempts keep their original version."
            : "This quiz is archived and read-only. Restore it as a draft before making changes."}
        </p>
      ) : null}

      <section aria-labelledby="details-heading" className="vc-surface p-6">
        <h2 id="details-heading" className="vc-heading text-xl">
          Details
        </h2>
        <div className="mt-5">
          {isReadOnly ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="vc-field-hint">Title</dt>
                  <dd className="mt-1 break-words font-semibold">{quiz.title}</dd>
              </div>
              <div>
                <dt className="vc-field-hint">Description</dt>
                  <dd className="mt-1 break-words whitespace-pre-line">
                  {quiz.description || "No description"}
                </dd>
              </div>
            </dl>
          ) : (
            <QuizDetailsForm
              quizId={quizId}
              title={quiz.title}
              description={quiz.description}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="settings-heading" className="vc-surface p-6">
        <h2 id="settings-heading" className="vc-heading text-xl">
          Settings
        </h2>
        <div className="mt-5">
          {isReadOnly ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="vc-field-hint">Instructions</dt>
                  <dd className="mt-1 break-words whitespace-pre-line">
                  {displayVersion.instructions || "No instructions"}
                </dd>
              </div>
              <div>
                <dt className="vc-field-hint">Passing score</dt>
                <dd className="mt-1">
                  {displayVersion.passing_score === null
                    ? "No passing score"
                    : `${displayVersion.passing_score}%`}
                </dd>
              </div>
              <div>
                <dt className="vc-field-hint">Certificates</dt>
                <dd className="mt-1">
                  {displayVersion.certificate_enabled ? "Enabled" : "Disabled"}
                </dd>
              </div>
            </dl>
          ) : editableVersion ? (
            <QuizSettingsForm quizId={quizId} version={editableVersion} />
          ) : null}
        </div>
      </section>

      <section aria-labelledby="questions-heading" className="space-y-4">
        <h2 id="questions-heading" className="vc-heading text-xl">
          Questions ({questions.length})
        </h2>

        {questions.length === 0 ? (
          <p className="vc-surface p-6 vc-body-copy">
            {isReadOnly
              ? "This version does not contain any questions."
              : "No questions yet. Add the first one below."}
          </p>
        ) : (
          <ul className="space-y-4">
            {questions.map((question, index) => (
              <li key={question.id} className="vc-surface p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display font-bold">
                    Question {index + 1} · {question.points} pt
                    {question.points === 1 ? "" : "s"}
                  </h3>
                  {!isReadOnly ? (
                    <QuestionAdminActions
                      quizId={quizId}
                      question={question}
                      isFirst={index === 0}
                      isLast={index === questions.length - 1}
                    />
                  ) : null}
                </div>

                {isReadOnly ? (
                  <>
                    <p className="break-words font-semibold">{question.prompt}</p>
                    <ul className="mt-3 space-y-2 text-sm text-lavender-300">
                      {question.options.map((option) => (
                        <li key={option.id} className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words">{option.label}</span>
                          {option.isCorrect ? (
                            <span className="rounded-full bg-sun-500/15 px-2 py-0.5 text-xs font-semibold text-sun-500">
                              Correct answer
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <QuestionForm quizId={quizId} question={question} />
                )}
              </li>
            ))}
          </ul>
        )}

        {!isReadOnly ? (
          <div className="vc-surface p-6">
            <h3 className="vc-heading text-lg">Add a question</h3>
            <div className="mt-5">
              <QuestionForm quizId={quizId} />
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="attempts-heading">
        <h2 id="attempts-heading" className="vc-heading text-xl">
          Recent submissions
        </h2>

        {attempts.length === 0 ? (
          <p className="vc-surface mt-4 p-6 vc-body-copy">
            No submissions recorded yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="vc-surface flex min-w-0 flex-wrap items-center justify-between gap-3 p-4 text-sm"
              >
                <span className="min-w-0 break-words font-semibold">
                  {attempt.participant_name ?? "Anonymous"}
                </span>
                <span className="text-lavender-300">
                  {attempt.score} / {attempt.max_score} ·{" "}
                  {Number(attempt.percentage ?? 0).toFixed(0)}%
                  {attempt.passed ? " · passed" : ""}
                </span>
                <span className="text-lavender-500">
                  {attempt.submitted_at
                    ? new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "UTC",
                      }).format(attempt.submitted_at)
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
