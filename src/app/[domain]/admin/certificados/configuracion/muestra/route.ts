import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/permissions";
import { buildPdfData, renderPdfFromData } from "@/lib/certificates/render";
import { getCurrentTenant } from "@/lib/tenant/context";

/** PDF de muestra con la configuración guardada (el QR apunta a un código que no existe). */
export async function GET() {
  const tenant = await getCurrentTenant();
  await requireRole(tenant.id, "tenant_admin");

  const config = tenant.certificateConfig;
  const data = await buildPdfData({
    tenantId: tenant.id,
    code: "PC-MUES-TRA2",
    holderName: "María Fernanda Gómez",
    holderDni: "30123456",
    courseTitle: "Eficiencia energética para PyMEs industriales",
    hours: "6",
    score: 87,
    issuedAt: new Date(),
    snapshot: {
      tenantName: tenant.name,
      tenantShortName: tenant.shortName,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.theme.primary,
      title: "Certificado de aprobación",
      graded: true,
      signatories: config.signatories,
      footerText: config.footerText?.trim() || null,
      showDni: config.showDni,
    },
  });
  const pdf = await renderPdfFromData(data);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="muestra-certificado.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
