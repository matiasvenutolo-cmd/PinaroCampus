"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { setReturnTo } from "@/lib/auth/return-to";
import { forTenant } from "@/lib/db/tenant-scope";
import { parseEmailList } from "@/lib/seat-codes";
import { getCurrentTenant } from "@/lib/tenant/context";

import {
  applyPaymentUpdate,
  cancelOrder,
  createOrder,
  redeemSeatCode,
  sendSeatInvites,
  startCheckout,
  type ServiceError,
} from "./service";
import { getProvider } from "./registry";

/** Quien compra tiene que tener sesión y haber hecho el onboarding; si no, se lo manda y se vuelve acá. */
async function requireBuyer(returnTo: string) {
  const tenant = await getCurrentTenant();
  const session = await auth();
  if (!session?.user?.id) {
    await setReturnTo(returnTo);
    redirect("/ingresar");
  }
  const membership = await forTenant(tenant.id).memberships.findByUserId(session.user.id);
  if (!membership?.onboardedAt) {
    await setReturnTo(returnTo);
    redirect("/bienvenida");
  }
  return { tenant, userId: session.user.id };
}

const ERROR_SLUG: Record<ServiceError, string> = {
  not_found: "no-disponible",
  not_available: "no-disponible",
  not_onboarded: "no-disponible",
  already_enrolled: "ya-inscripto",
  members_only: "solo-socios",
  invalid_cuit: "cuit-invalido",
  invalid_quantity: "cantidad-invalida",
  invalid_state: "orden-no-disponible",
  provider_unavailable: "medio-no-disponible",
  forbidden: "no-disponible",
  amount_mismatch: "no-disponible",
};

const slugSchema = z.string().min(1).max(200);

/** "Inscribirme": crea la orden individual con el precio del servidor y sigue al pago (o entra directo si es gratis). */
export async function startPurchase(courseSlug: string) {
  const parsedSlug = slugSchema.parse(courseSlug);
  const back = `/cursos/${encodeURIComponent(parsedSlug)}`;
  const { tenant, userId } = await requireBuyer(back);

  const result = await createOrder(tenant, userId, { courseSlug: parsedSlug, type: "individual" });
  if (!result.ok) {
    if (result.error === "already_enrolled") redirect(`/aprender/${parsedSlug}`);
    redirect(`${back}?error=${ERROR_SLUG[result.error]}`);
  }
  redirect(result.free ? `/aprender/${parsedSlug}` : `/checkout/${result.order.id}`);
}

const seatSchema = z.object({
  courseSlug: slugSchema,
  quantity: z.coerce.number().int(),
  cuit: z.string().trim().max(20),
});

/** "Comprar para mi equipo": crea la orden de vacantes. */
export async function startSeatPurchase(formData: FormData) {
  const parsed = seatSchema.safeParse({
    courseSlug: formData.get("courseSlug"),
    quantity: formData.get("quantity"),
    cuit: formData.get("cuit"),
  });
  if (!parsed.success) redirect("/cursos");
  const { courseSlug, quantity, cuit } = parsed.data;
  const back = `/empresas/comprar?curso=${encodeURIComponent(courseSlug)}`;
  const { tenant, userId } = await requireBuyer(back);

  const result = await createOrder(tenant, userId, { courseSlug, type: "seat_pack", quantity, companyCuit: cuit });
  if (!result.ok) redirect(`${back}&cantidad=${quantity}&cuit=${encodeURIComponent(cuit)}&error=${ERROR_SLUG[result.error]}`);
  redirect(result.free ? `/mis-compras/${result.order.id}` : `/checkout/${result.order.id}`);
}

/** Elige el medio de pago de una orden. */
export async function chooseProvider(orderId: string, formData: FormData) {
  const back = `/checkout/${orderId}`;
  const { tenant, userId } = await requireBuyer(back);
  const providerId = String(formData.get("provider") ?? "");

  const result = await startCheckout(tenant, userId, orderId, providerId);
  if (!result.ok) redirect(`${back}?error=${ERROR_SLUG[result.error]}`);
  redirect(result.next.kind === "redirect" ? result.next.url : `/checkout/${orderId}/resultado`);
}

export async function cancelMyOrder(orderId: string) {
  const { tenant, userId } = await requireBuyer(`/mis-compras/${orderId}`);
  await cancelOrder(tenant, userId, orderId);
  redirect("/mis-compras");
}

const outcomeSchema = z.enum(["approved", "rejected", "pending"]);

/**
 * Pantalla del pago simulado (proveedor `mock`, solo demo). Entra por
 * `applyPaymentUpdate` como cualquier pago real, así lo que se muestra en la
 * demo es el mismo camino que después recorre Mercado Pago.
 */
export async function simulatePayment(paymentId: string, outcome: string) {
  const { tenant, userId } = await requireBuyer(`/checkout/simulado/${paymentId}`);
  const status = outcomeSchema.parse(outcome);
  const provider = getProvider("mock");
  if (!provider || !(await provider.isAvailable(tenant))) redirect("/cursos");

  const scoped = forTenant(tenant.id);
  const payment = await scoped.payments.findById(paymentId);
  const order = payment ? await scoped.orders.findById(payment.orderId) : null;
  if (!payment || !order || order.buyerUserId !== userId || payment.provider !== "mock") redirect("/mis-compras");

  await applyPaymentUpdate(tenant, "mock", {
    externalId: payment.externalId ?? `mock_${payment.id}`,
    externalReference: order.id,
    status,
    amountCents: order.totalCents,
    feeCents: 0,
    raw: { simulated: true, outcome: status },
  });
  redirect(`/checkout/${order.id}/resultado`);
}

const invitesSchema = z.object({ emails: z.string().max(20_000) });

/** Envía un código a cada email pegado. */
export async function sendInvites(orderId: string, formData: FormData) {
  const back = `/mis-compras/${orderId}`;
  const { tenant, userId } = await requireBuyer(back);
  const parsed = invitesSchema.safeParse({ emails: formData.get("emails") });
  if (!parsed.success) redirect(`${back}?invitar=error`);

  const { valid, invalid } = parseEmailList(parsed.data.emails);
  if (valid.length === 0) redirect(`${back}?invitar=vacio`);
  const result = await sendSeatInvites(tenant, userId, orderId, valid);
  if (!result.ok) redirect(`${back}?invitar=error`);
  redirect(`${back}?invitar=ok&enviados=${result.sent.length}&sin-codigo=${result.withoutCode.length}&invalidos=${invalid.length}`);
}

/** Canje de una vacante. */
export async function redeemCode(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const back = `/canjear?codigo=${encodeURIComponent(code)}`;
  const { tenant, userId } = await requireBuyer(back);

  const result = await redeemSeatCode(tenant, userId, code);
  if (!result.ok) redirect(`${back}&error=${result.error}`);
  redirect(result.slug ? `/aprender/${result.slug}` : "/mi-campus");
}

/** Para quien abre el link del email sin sesión: ingresa y vuelve al canje con el código. */
export async function loginToRedeem(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  await setReturnTo(`/canjear?codigo=${encodeURIComponent(code)}`);
  redirect("/ingresar");
}
