import type { Kysely } from "kysely";

import { ValidationError } from "@/lib/errors";
import type { CertificateRow, Database } from "@/lib/db/types";
import {
  CERTIFICATE_TEMPLATE_VERSION,
  evaluateCertificateEligibility,
} from "../domain/eligibility";
import { CertificateRepository } from "../infrastructure/certificate-repository";

/**
 * Issues a certificate for a submitted attempt when it is eligible.
 *
 * Runs inside the submission transaction so a scored result always has its
 * certificate decision evaluated against the exact same database snapshot.
 * Issuance is idempotent: calling it again returns the existing certificate.
 */
export async function issueCertificateIfEligible(
  db: Kysely<Database>,
  attemptId: string,
): Promise<CertificateRow | null> {
  const certificates = new CertificateRepository(db);

  const source = await certificates.loadEligibilitySource(attemptId);
  if (!source) return null;

  const existing = await certificates.findByAttemptId(attemptId);

  const eligibility = evaluateCertificateEligibility({
    attemptStatus: source.attempt.status,
    certificateEnabled: source.certificateEnabled,
    passingScore: source.passingScore,
    percentage: Number(source.attempt.percentage ?? 0),
    participantName: source.attempt.participant_name,
    alreadyIssued: Boolean(existing) && existing!.revoked_at === null,
    revoked: Boolean(existing?.revoked_at),
  });

  if (!eligibility.eligible) return null;

  if (existing && existing.revoked_at === null) return existing;

  return certificates.issue({
    attempt: source.attempt,
    quizTitle: source.quizTitle,
    participantName: source.attempt.participant_name!,
    score: Number(source.attempt.score ?? 0),
    maxScore: Number(source.attempt.max_score ?? 0),
    percentage: Number(source.attempt.percentage ?? 0),
    templateVersion: source.templateVersion || CERTIFICATE_TEMPLATE_VERSION,
  });
}

export async function getCertificateForAttempt(
  db: Kysely<Database>,
  attemptId: string,
): Promise<CertificateRow | null> {
  const certificate = await new CertificateRepository(db).findByAttemptId(attemptId);
  return certificate && !certificate.revoked_at ? certificate : null;
}

/**
 * Resolves a certificate for its public bearer link.
 *
 * The identifier is opaque, so possession of the URL is the credential. Only
 * the fields printed on the certificate are returned.
 */
export async function getCertificateByPublicId(
  db: Kysely<Database>,
  publicId: string,
): Promise<CertificateRow | null> {
  const certificate = await new CertificateRepository(db).findByPublicId(publicId);

  if (!certificate || certificate.revoked_at) {
    throw new ValidationError("This certificate link is not valid.");
  }

  return certificate;
}