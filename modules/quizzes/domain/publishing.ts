import { ConflictError, ValidationError } from "@/lib/errors";
import type { PublicationStatus } from "@/lib/domain/enums";
import { validateQuizVersionContent, type QuizVersionContent } from "./quiz-content";

/**
 * A quiz version is immutable once it has been published.
 *
 * Drafts are edited in place; publishing freezes the row so every attempt keeps
 * pointing at exactly the questions and correct answers it was scored against.
 */
export function isEditable(status: "draft" | "published" | "retired"): boolean {
  return status === "draft";
}

export function assertVersionEditable(status: "draft" | "published" | "retired"): void {
  if (!isEditable(status)) {
    throw new ConflictError(
      "This quiz version is already published and cannot be edited. Start a new draft to make changes.",
    );
  }
}

/** Publication rules are explicit rather than inferred from UI state. */
export function assertCanPublish(
  publicationStatus: PublicationStatus,
  content: QuizVersionContent,
): void {
  if (publicationStatus === "archived") {
    throw new ConflictError(
      "An archived quiz cannot be published. Restore it to draft first.",
    );
  }

  if (publicationStatus === "published") {
    throw new ConflictError("Unpublish this quiz before publishing a new version.");
  }

  validateQuizVersionContent(content);

  if (content.certificateEnabled && content.passingScore === null) {
    throw new ValidationError(
      "A certificate-enabled quiz needs a passing score.",
      { passingScore: ["Set a passing score or disable certificates."] },
    );
  }
}

export function assertCanUnpublish(publicationStatus: PublicationStatus): void {
  if (publicationStatus !== "published") {
    throw new ConflictError("Only a published quiz can be unpublished.");
  }
}

export function assertCanArchive(publicationStatus: PublicationStatus): void {
  if (publicationStatus === "archived") {
    throw new ConflictError("This quiz is already archived.");
  }
}

/**
 * Archiving hides the public link. Historical attempts and certificates are
 * intentionally left intact so results remain verifiable.
 */
export function publicQuizLinkIsAvailable(
  publicationStatus: PublicationStatus,
): boolean {
  return publicationStatus === "published";
}
