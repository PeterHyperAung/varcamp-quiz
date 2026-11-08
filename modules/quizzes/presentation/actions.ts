"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/lib/db/client";
import { failure, toActionState, type ActionState } from "@/lib/forms";
import { ManageQuizzes } from "@/modules/quizzes/application/manage-quizzes";
import { requireAdminSession } from "@/modules/admin-auth/presentation/session";

/**
 * Administrative quiz mutations.
 *
 * Every action starts with `requireAdminSession()`: hiding a button in the UI is
 * not authorization, and these functions are callable directly.
 */

function formValue(formData: FormData, key: string): FormDataEntryValue | null {
  return formData.get(key);
}

export async function createQuizAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdminSession();

  try {
    const manage = new ManageQuizzes(getDb());
    const quiz = await manage.create(
      {
        title: formValue(formData, "title"),
        description: formValue(formData, "description"),
      },
      session.administratorId,
    );

    revalidatePath("/admin/quizzes");
    return { status: "success", message: quiz.id };
  } catch (error) {
    return toActionState(error, "createQuiz");
  }
}

export async function updateQuizDetailsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.updateDetails(quizId, {
      title: formValue(formData, "title"),
      description: formValue(formData, "description"),
    });

    revalidatePath(`/admin/quizzes/${quizId}`);
    return { status: "success", message: "Quiz details saved." };
  } catch (error) {
    return toActionState(error, "updateQuizDetails");
  }
}

export async function saveQuizSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.updateSettings(quizId, {
      instructions: formValue(formData, "instructions"),
      passingScore: formValue(formData, "passingScore"),
      // An unchecked checkbox is simply absent from the payload.
      certificateEnabled: formData.get("certificateEnabled") ?? "false",
    });

    revalidatePath(`/admin/quizzes/${quizId}`);
    return { status: "success", message: "Settings saved." };
  } catch (error) {
    return toActionState(error, "saveQuizSettings");
  }
}

/**
 * Parses the question editor form into the shape the use case validates.
 *
 * Correct answers arrive as a `correct` field repeated once per checked option,
 * so the option index has to be paired back up with its label.
 */
function readQuestionForm(formData: FormData) {
  const rawOptions = formData.getAll("optionLabel").map((value) => String(value));
  const correctIndexes = new Set(
    formData.getAll("correct").map((value) => String(value)),
  );

  return {
    prompt: String(formValue(formData, "prompt") ?? ""),
    questionType: String(formValue(formData, "questionType") ?? "multiple_choice"),
    points: Number(formValue(formData, "points") ?? 1),
    options: rawOptions.map((label, index) => ({
      label,
      isCorrect: correctIndexes.has(String(index)),
    })),
  };
}

export async function addQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.addQuestion(quizId, readQuestionForm(formData));

    revalidatePath(`/admin/quizzes/${quizId}`);
    return { status: "success", message: "Question added." };
  } catch (error) {
    return toActionState(error, "addQuestion");
  }
}

export async function updateQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));
  const questionId = String(formValue(formData, "questionId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.updateQuestion(quizId, questionId, readQuestionForm(formData));

    revalidatePath(`/admin/quizzes/${quizId}`);
    return { status: "success", message: "Question updated." };
  } catch (error) {
    return toActionState(error, "updateQuestion");
  }
}

export async function deleteQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));
  const questionId = String(formValue(formData, "questionId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.deleteQuestion(quizId, questionId);

    revalidatePath(`/admin/quizzes/${quizId}`);
    return { status: "success", message: "Question removed." };
  } catch (error) {
    return toActionState(error, "deleteQuestion");
  }
}

/** Moves a question one position up or down. */
export async function moveQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));
  const questionId = String(formValue(formData, "questionId"));
  const direction = String(formValue(formData, "direction"));

  try {
    const manage = new ManageQuizzes(getDb());
    const { questions } = await manage.getForEditing(quizId);

    const ordered = questions.map((question) => question.id);
    const index = ordered.indexOf(questionId);

    if (index === -1) return failure("Question not found.");

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) return { status: "success" };

    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];

    await manage.reorderQuestions(quizId, ordered);

    revalidatePath(`/admin/quizzes/${quizId}`);
    return { status: "success" };
  } catch (error) {
    return toActionState(error, "moveQuestion");
  }
}

export async function publishQuizAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.publish(quizId);

    revalidatePath(`/admin/quizzes/${quizId}`);
    revalidatePath("/admin/quizzes");
    revalidatePath("/quizzes");
    revalidatePath("/");
    return { status: "success", message: "Quiz published." };
  } catch (error) {
    return toActionState(error, "publishQuiz");
  }
}

export async function unpublishQuizAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.unpublish(quizId);

    revalidatePath(`/admin/quizzes/${quizId}`);
    revalidatePath("/admin/quizzes");
    revalidatePath("/quizzes");
    revalidatePath("/");
    return { status: "success", message: "Quiz unpublished." };
  } catch (error) {
    return toActionState(error, "unpublishQuiz");
  }
}

export async function archiveQuizAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.archive(quizId);

    revalidatePath(`/admin/quizzes/${quizId}`);
    revalidatePath("/admin/quizzes");
    revalidatePath("/quizzes");
    revalidatePath("/");
    return { status: "success", message: "Quiz archived." };
  } catch (error) {
    return toActionState(error, "archiveQuiz");
  }
}

export async function restoreQuizAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminSession();
  const quizId = String(formValue(formData, "quizId"));

  try {
    const manage = new ManageQuizzes(getDb());
    await manage.restore(quizId);

    revalidatePath(`/admin/quizzes/${quizId}`);
    revalidatePath("/admin/quizzes");
    return { status: "success", message: "Quiz restored as a draft." };
  } catch (error) {
    return toActionState(error, "restoreQuiz");
  }
}