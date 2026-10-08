import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { normalizeCertificateCode } from "@/lib/certificates/code";
import { renderCertificatePdf } from "@/lib/certificates/render";
import { forTenant } from "@/lib/db/tenant-scope";
import { redirectToPath } from "@/lib/tenant/redirect";
import { lookupCertificateByCode } from "@/lib/db/scope/certificates";

export const runtime = "nodejs";

/**
 * PDF del certificado (docs/06). Lo pueden bajar el titular, los admins de la
 * cámara emisora y el superadmin; la verificación pública NO entrega el PDF.
 * Revocado → 410. El permiso se decide con el dueño del certificado, no con el
 * host del request (así el link sirve desde cualquier dominio de la cámara).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCertificateCode((await params).code);
  if (!code) return new NextResponse("No encontrado", { status: 404 });

  const session = await auth();
  if (!session?.user?.id) {
    return redirectToPath("/ingresar");
  }

  const found = await lookupCertificateByCode(code);
  if (!found) return new NextResponse("No encontrado", { status: 404 });
  const { certificate } = found;

  const isHolder = certificate.userId === session.user.id;
  let allowed = isHolder || session.user.isSuperadmin === true;
  if (!allowed) {
    const membership = await forTenant(certificate.tenantId).memberships.findByUserId(session.user.id);
    allowed = membership?.role === "tenant_admin";
  }
  if (!allowed) return new NextResponse("No encontrado", { status: 404 });

  if (certificate.revokedAt) {
    return new NextResponse("Este certificado fue revocado.", { status: 410 });
  }

  const pdf = await renderCertificatePdf(certificate);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Certificado-${certificate.code}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
