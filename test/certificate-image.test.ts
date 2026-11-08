import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";

import {
  certificateImage,
  wrapCertificateText,
} from "@/modules/certificates/presentation/certificate-image";
import type { CertificateRow } from "@/lib/db/types";

describe("certificate image", () => {
  it("wraps long certificate text, including unbroken names", () => {
    expect(wrapCertificateText("Ada Lovelace", 30)).toEqual(["Ada Lovelace"]);
    expect(wrapCertificateText("A".repeat(65), 30)).toEqual([
      "A".repeat(30),
      "A".repeat(30),
      "A".repeat(5),
    ]);
    expect(wrapCertificateText("👩‍🚀👩‍🚀", 1)).toEqual(["👩‍🚀", "👩‍🚀"]);
  });

  it("renders a PNG for an issued certificate", async () => {
    const certificate: CertificateRow = {
      id: "certificate-id",
      public_id: "public-certificate-id",
      attempt_id: "attempt-id",
      quiz_id: "quiz-id",
      quiz_version_id: "quiz-version-id",
      participant_name: "Test Participant",
      quiz_title: "VarCamp Welcome Quiz",
      score: 4,
      max_score: 5,
      percentage: 80,
      template_version: "v1",
      issued_at: new Date("2026-10-18T12:00:00.000Z"),
      revoked_at: null,
      created_at: new Date("2026-10-18T12:00:00.000Z"),
    };

    const response = new ImageResponse(certificateImage(certificate), {
      width: 1200,
      height: 848,
    });
    const png = Buffer.from(await response.arrayBuffer());

    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );

    const longResponse = new ImageResponse(
      certificateImage({
        ...certificate,
        participant_name: "LongParticipantName".repeat(4),
        quiz_title: "A long quiz title ".repeat(12),
      }),
      { width: 1200, height: 848 },
    );
    const longPng = Buffer.from(await longResponse.arrayBuffer());

    expect(longPng.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  });
});
