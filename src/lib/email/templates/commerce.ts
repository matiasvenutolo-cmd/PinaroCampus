import { formatCents } from "@/lib/format";
import type { Tenant } from "@/lib/tenant/resolve";

import { renderEmail } from "./shell";

type Mail = { subject: string; html: string; text: string };

function build(
  subject: string,
  args: Parameters<typeof renderEmail>[0],
): Mail {
  const { html, text } = renderEmail(args);
  return { subject, html, text };
}

/** Orden pendiente de transferencia, con las instrucciones. */
export function transferPendingEmail({
  tenant,
  orderNumber,
  courseTitle,
  totalCents,
  instructions,
  ordersUrl,
}: {
  tenant: Tenant;
  orderNumber: string;
  courseTitle: string;
  totalCents: number;
  instructions: string;
  ordersUrl: string;
}) {
  return build(`Tu orden ${orderNumber}: falta la transferencia`, {
    tenant,
    heading: "Tu orden está esperando el pago",
    paragraphs: [
      `Orden ${orderNumber} · ${courseTitle} · ${formatCents(totalCents)}.`,
      instructions,
      "Cuando la cámara confirme la transferencia, tu inscripción se activa y te avisamos por email.",
    ],
    cta: { label: "Ver mi orden", url: ordersUrl },
  });
}

/** Pago aprobado: inscripción confirmada (individual) o códigos listos (vacantes). */
export function paymentApprovedEmail({
  tenant,
  orderNumber,
  courseTitle,
  kind,
  quantity,
  url,
}: {
  tenant: Tenant;
  orderNumber: string;
  courseTitle: string;
  kind: "individual" | "seat_pack";
  quantity: number;
  url: string;
}) {
  if (kind === "seat_pack") {
    return build(`Tus ${quantity} códigos de vacante están listos`, {
      tenant,
      heading: "¡Tus códigos de vacante están listos!",
      paragraphs: [
        `Confirmamos el pago de la orden ${orderNumber}: ${quantity} vacantes para "${courseTitle}".`,
        "Entrá a Mis compras para copiarlos, descargarlos o enviárselos por email a tu equipo.",
      ],
      cta: { label: "Ver mis códigos", url },
    });
  }
  return build(`Estás inscripto en ${courseTitle}`, {
    tenant,
    heading: "¡Pago confirmado! Ya estás inscripto",
    paragraphs: [`Orden ${orderNumber}: te inscribimos en "${courseTitle}". Podés empezar cuando quieras.`],
    cta: { label: "Ir al curso", url },
  });
}

export function paymentRejectedEmail({
  tenant,
  orderNumber,
  courseTitle,
  url,
}: {
  tenant: Tenant;
  orderNumber: string;
  courseTitle: string;
  url: string;
}) {
  return build(`No pudimos procesar el pago de ${orderNumber}`, {
    tenant,
    heading: "No se pudo procesar el pago",
    paragraphs: [
      `El pago de la orden ${orderNumber} ("${courseTitle}") fue rechazado. No se te cobró nada.`,
      "Podés volver a intentarlo con el mismo u otro medio de pago.",
    ],
    cta: { label: "Reintentar el pago", url },
  });
}

/** "Te regalaron una vacante": al empleado, con el código y el link. */
export function seatInviteEmail({
  tenant,
  courseTitle,
  buyerName,
  code,
  redeemUrl,
}: {
  tenant: Tenant;
  courseTitle: string;
  buyerName: string;
  code: string;
  redeemUrl: string;
}) {
  return build(`${buyerName} te invitó a cursar ${courseTitle}`, {
    tenant,
    heading: "Te regalaron una vacante",
    paragraphs: [
      `${buyerName} te invitó al curso "${courseTitle}" en ${tenant.campusName}.`,
      `Tu código: ${code}`,
      "Entrá con el botón, iniciá sesión y la vacante queda a tu nombre.",
    ],
    cta: { label: "Canjear mi vacante", url: redeemUrl },
    footnote: "Si no esperabas este email, lo podés ignorar.",
  });
}

/** Socio aprobado / rechazado. */
export function memberDecisionEmail({
  tenant,
  approved,
  url,
}: {
  tenant: Tenant;
  approved: boolean;
  url: string;
}) {
  return approved
    ? build(`Tu empresa fue validada como socia de ${tenant.shortName}`, {
        tenant,
        heading: "¡Socio validado!",
        paragraphs: ["La cámara aprobó tu pedido: desde ahora ves y pagás el precio de socio."],
        cta: { label: "Ver los cursos", url },
      })
    : build(`Sobre tu pedido de socio en ${tenant.shortName}`, {
        tenant,
        heading: "No pudimos validar tu condición de socio",
        paragraphs: [
          "La cámara no aprobó el pedido, así que seguís viendo el precio general.",
          `Si creés que es un error, escribinos a ${tenant.contactEmail}.`,
        ],
        cta: { label: "Ver los cursos", url },
      });
}
