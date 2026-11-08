/**
 * Certificate eligibility rules.
 *
 * Eligibility is data-driven rather than assumed: a quiz only issues
 * certificates when the published version enables them, and each quiz decides
 * its own threshold. This module takes a plain input object so the certificates
 * domain does not depend on quizzes or quiz-attempts internals.
 */

export interface CertificateEligibilityInput {
  attemptStatus: "in_progress" | "submitted";
  certificateEnabled: boolean;
  /** Percentage required to be eligible. Null means "no threshold configured". */
  passingScore: number | null;
  percentage: number;
  participantName: string | null;
  /** Set when a certificate already exists and is still valid. */
  alreadyIssued: boolean;
  /** Set when an existing certificate has been revoked by an administrator. */
  revoked: boolean;
}

export type CertificateIneligibilityReason =
  | "attempt_not_submitted"
  | "certificates_disabled"
  | "name_missing"
  | "below_passing_score"
  | "certificate_revoked"
  | "already_issued";

export interface CertificateEligibility {
  eligible: boolean;
  reason?: CertificateIneligibilityReason;
}

export function evaluateCertificateEligibility(
  input: CertificateEligibilityInput,
): CertificateEligibility {
  if (input.attemptStatus !== "submitted") {
    return { eligible: false, reason: "attempt_not_submitted" };
  }

  if (!input.certificateEnabled) {
    return { eligible: false, reason: "certificates_disabled" };
  }

  if (!input.participantName || input.participantName.trim().length === 0) {
    return { eligible: false, reason: "name_missing" };
  }

  if (input.revoked) {
    return { eligible: false, reason: "certificate_revoked" };
  }

  if (input.alreadyIssued) {
    return { eligible: false, reason: "already_issued" };
  }

  // A version with certificates enabled always has a passing score (enforced
  // at publish time); treat a null threshold defensively as "everyone".
  const threshold = input.passingScore ?? 0;
  if (input.percentage < threshold) {
    return { eligible: false, reason: "below_passing_score" };
  }

  return { eligible: true };
}

export const CERTIFICATE_INELIGIBILITY_MESSAGES: Record<
  CertificateIneligibilityReason,
  string
> = {
  attempt_not_submitted: "Submit the quiz before requesting a certificate.",
  certificates_disabled: "This quiz does not issue certificates.",
  name_missing: "This quiz requires your name to issue a certificate.",
  below_passing_score: "The passing score for this quiz was not reached.",
  certificate_revoked: "This certificate has been revoked.",
  already_issued: "A certificate has already been issued for this attempt.",
};

/** The template version stamped onto each issued certificate. */
export const CERTIFICATE_TEMPLATE_VERSION = "v1";