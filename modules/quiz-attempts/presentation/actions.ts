"use server";

import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { toActionState } from "@/lib/forms";
import { TakeQuiz } from "@/modules/quiz-attempts/application/take-quiz";
import { ANSWER_FIELD_PREFIX } from "./answer-field";

/**
 * Public quiz participation.
 *
 * These actions are reachable by anyone — that is the point — so they treat
 * every field as untrusted and never trust a client-supplied score.
 */

export async function startAttemptAction(formData: FormData): Promise<void> {
  const quizPublicId = String(formData.get("quizPublicId") ?? "");
  const participantName = String(formData.get("participantName") ?? "");

  const takeQuiz = new TakeQuiz(getDb());

  let attemptPublicId: string;
  try {
    ({ attemptPublicId } = await takeQuiz.start({ quizPublicId, participantName }));
  } catch (error) {
    const state = toActionState(error, "startAttempt");
    redirect(`/quizzes/${quizPublicId}?error=${encodeURIComponent(state.message ?? "Unable to start.")}`);
  }

  // The attempt id is opaque; the participant keeps it as a bearer link to
  // their result page.
  redirect(`/quizzes/${quizPublicId}?attempt=${attemptPublicId}`);
}

export async function submitAttemptAction(formData: FormData): Promise<void> {
  const quizPublicId = String(formData.get("quizPublicId") ?? "");
  const attemptPublicId = String(formData.get("attemptPublicId") ?? "");
  const participantName = String(formData.get("participantName") ?? "");

  // Each question's radio group is named `answer_<questionId>` so the options
  // stay mutually exclusive, which means the question id travels in the key.
  const answers: Array<{ questionId: string; selectedOptionId: string | null }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(ANSWER_FIELD_PREFIX)) continue;
    if (typeof value !== "string" || value.length === 0) continue;

    answers.push({
      questionId: key.slice(ANSWER_FIELD_PREFIX.length),
      selectedOptionId: value,
    });
  }

  const takeQuiz = new TakeQuiz(getDb());

  try {
    await takeQuiz.submit({ attemptPublicId, participantName, answers });
  } catch (error) {
    const state = toActionState(error, "submitAttempt");
    redirect(
      `/quizzes/${quizPublicId}?attempt=${attemptPublicId}&error=${encodeURIComponent(state.message ?? "Unable to submit.")}`,
    );
  }

  redirect(`/quizzes/${quizPublicId}/result/${attemptPublicId}`);
}