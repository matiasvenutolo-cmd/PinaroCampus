import type { Tenant } from "@/lib/tenant/resolve";

import { renderEmail } from "./shell";

/** "¡Aprobaste!" con el link a Mis certificados (docs/06). */
export function certificateIssuedEmail({
  tenant,
  holderName,
  courseTitle,
  code,
  certificatesUrl,
  verifyUrl,
}: {
  tenant: Tenant;
  holderName: string;
  courseTitle: string;
  code: string;
  certificatesUrl: string;
  verifyUrl: string;
}) {
  const { html, text } = renderEmail({
    tenant,
    heading: "¡Aprobaste!",
    paragraphs: [
      `${holderName}, completaste "${courseTitle}" y tu certificado ya está listo para descargar.`,
      `Código de verificación: ${code}`,
    ],
    cta: { label: "Ver mi certificado", url: certificatesUrl },
    footnote: `Cualquier persona puede comprobar que es auténtico en ${verifyUrl}`,
  });
  return { subject: `Tu certificado de ${courseTitle}`, html, text };
}
