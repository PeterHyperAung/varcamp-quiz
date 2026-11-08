import { ImageResponse } from "next/og";

import { getDb } from "@/lib/db/client";
import { getCertificateByPublicId } from "@/modules/certificates/application/issue-certificate";
import { certificateImage } from "@/modules/certificates/presentation/certificate-image";

/**
 * Serves a certificate as a PNG.
 *
 * The public id in the URL is an opaque bearer credential, so the response is
 * never cached in a shared store and no personal information appears in the URL.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ certificateId: string }> },
) {
  const { certificateId } = await context.params;

  try {
    const certificate = await getCertificateByPublicId(getDb(), certificateId);

    if (!certificate) {
      return new Response("Certificate not found", { status: 404 });
    }

    return new ImageResponse(certificateImage(certificate), {
      width: 1200,
      height: 848,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    // Do not distinguish "unknown id" from "revoked id", and never surface the
    // underlying database error.
    return new Response("Certificate not found", { status: 404 });
  }
}