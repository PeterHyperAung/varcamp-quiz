import type { ReactElement } from "react";

import type { CertificateRow } from "@/lib/db/types";

/**
 * Certificate artwork.
 *
 * Rendered by `next/og`'s `ImageResponse` into a PNG per request, so no image
 * storage is required. The issued record is immutable, which is what keeps a
 * certificate visually stable even after the template is restyled — the
 * `template_version` stamp records which design produced it.
 */
export function certificateImage(
  certificate: CertificateRow,
): ReactElement {
  const issued = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(certificate.issued_at);
  const participantLines = wrapCertificateText(certificate.participant_name, 30);
  const quizTitleLines = wrapCertificateText(certificate.quiz_title, 52);
  const participantFontSize = fittedFontSize(participantLines, 62, 26, 1040);
  const quizTitleFontSize = fittedFontSize(quizTitleLines, 24, 14, 1040);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        backgroundColor: "#000137",
        backgroundImage:
          "radial-gradient(120% 90% at 85% 0%, #200762 0%, #090a4b 45%, #000137 100%)",
        padding: 64,
        fontFamily: "sans-serif",
      }}
    >
      {/* Thin circuit traces, echoing the site theme. */}
      <svg width="1072" height="240" style={{ position: "absolute", top: 0 }}>
        <g fill="none" strokeWidth="2" strokeLinecap="square" style={{ opacity: 0.55 }}>
          <path d="M60 200 H300 V120 H520" stroke="#e33e99" />
          <path d="M520 120 V60 H700" stroke="#e21a4a" />
          <path d="M700 60 H900 V150 H1060" stroke="#2d81ff" />
          <path d="M120 240 V180 H380" stroke="#2d81ff" />
        </g>
        <g>
          <rect x="300" y="112" width="18" height="18" fill="#2d81ff" />
          <rect x="512" y="112" width="18" height="18" fill="#e21a4a" />
          <rect x="692" y="52" width="18" height="18" fill="#2d81ff" />
          <rect x="892" y="142" width="18" height="18" fill="#e33e99" />
        </g>
      </svg>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 34,
            height: 40,
            backgroundColor: "#e21a4a",
            borderRadius: "40% 40% 45% 45%",
          }}
        />
        <div
          style={{
            color: "#ffffff",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: 1,
          }}
        >
          VARCAMP
        </div>
      </div>

      <div
        style={{
          color: "#b9bde8",
          fontSize: 20,
          letterSpacing: 5,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        Certificate of participation
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 1040,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <div style={{ width: "100%", color: "#b9bde8", fontSize: 20, textAlign: "center" }}>
          This certifies that
        </div>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {participantLines.map((line, index) => (
            <div
              key={`participant-${index}`}
              style={{
                width: "100%",
                color: "#ffffff",
                fontSize: participantFontSize,
                fontWeight: 800,
                lineHeight: 1.1,
                textAlign: "center",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginTop: 8,
          padding: "14px 32px",
          borderRadius: 999,
          backgroundColor: "#ffc940",
          color: "#000137",
          fontSize: 26,
          fontWeight: 800,
        }}
      >
        <span>{certificate.score}</span>
        <span style={{ fontSize: 20 }}>/</span>
        <span>{certificate.max_score}</span>
        <span style={{ fontSize: 20 }}>·</span>
        <span>{Number(certificate.percentage).toFixed(0)}%</span>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 1040,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        {quizTitleLines.map((line, index) => (
          <div
            key={`quiz-title-${index}`}
            style={{
              width: "100%",
              color: "#ffffff",
              fontSize: quizTitleFontSize,
              lineHeight: 1.15,
              textAlign: "center",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          marginTop: "auto",
          color: "#b9bde8",
          fontSize: 18,
        }}
      >
        <div>{`Issued ${issued}`}</div>
        <div>{`ID ${certificate.public_id} · template ${certificate.template_version}`}</div>
      </div>
    </div>
  );
}

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

/** Wraps long certificate fields into bounded lines, including unbroken names. */
export function wrapCertificateText(text: string, maxCharacters: number): string[] {
  if (maxCharacters < 1) throw new RangeError("maxCharacters must be positive.");

  const lines: string[] = [];
  let line = "";

  for (const word of text.trim().split(/\s+/u).filter(Boolean)) {
    const characters = graphemes(word);

    while (characters.length > maxCharacters) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(characters.splice(0, maxCharacters).join(""));
    }

    const remainder = characters.join("");
    if (!remainder) continue;

    if (line && graphemes(line).length + 1 + graphemes(remainder).length > maxCharacters) {
      lines.push(line);
      line = remainder;
    } else {
      line = line ? `${line} ${remainder}` : remainder;
    }
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function fittedFontSize(
  lines: readonly string[],
  baseSize: number,
  minimumSize: number,
  maxWidth: number,
): number {
  const longestLine = Math.max(1, ...lines.map((line) => graphemes(line).length));
  return Math.max(minimumSize, Math.min(baseSize, Math.floor(maxWidth / longestLine)));
}
