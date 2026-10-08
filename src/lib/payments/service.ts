import "server-only";

import { getUserProfile } from "@/lib/auth/user-profile";
import { isValidCuit, normalizeCuit, formatCuit } from "@/lib/cuit";
import type { Order, Payment } from "@/lib/db/scope/orders";
import { forTenant } from "@/lib/db/tenant-scope";
import { sendEmail } from "@/lib/email/send";
import {
  memberDecisionEmail,
  paymentApprovedEmail,
  paymentRejectedEmail,
  seatInviteEmail,
  transferPendingEmail,
} from "@/lib/email/templates/commerce";
import {
  SEAT_PACK_MIN,
  canPurchaseCourse,
  getUnitPrice,
  quoteOrder,
  resolvePurchaseTier,
  type OrderKind,
  type OrderQuote,
  type PricingTier,
} from "@/lib/pricing";
import { normalizeSeatCode } from "@/lib/seat-codes";
import type { Tenant } from "@/lib/tenant/resolve";
import { buildTenantUrl } from "@/lib/tenant/urls";

import { getProvider } from "./registry";
import type { NormalizedPayment, ProviderId } from "./types";

export type ServiceError =
  | "not_found"
  | "not_available"
  | "not_onboarded"
  | "already_enrolled"
  | "members_only"
  | "invalid_cuit"
  | "invalid_quantity"
  | "invalid_state"
  | "provider_unavailable"
  | "forbidden"
  | "amount_mismatch";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: ServiceError };

const PENDING_ORDER_HOURS = 72;
const HOUR = 3_600_000;

function fail(error: ServiceError): { ok: false; error: ServiceError } {
  return { ok: false, error };
}

/** Un error de email no deshace una compra ya registrada. */
async function notify(tenant: Tenant, to: string, mail: { subject: string; html: string; text: string }) {
  try {
    await sendEmail({ tenantId: tenant.id, to, replyTo: tenant.contactEmail, ...mail });
  } catch (error) {
    console.error(JSON.stringify({ event: "email_failed", tenantId: tenant.id, subject: mail.subject, error: String(error) }));
  }
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

// ---------------------------------------------------------------------------
// Crear la orden
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  courseSlug: string;
  type: OrderKind;
  quantity?: number;
  /** Solo `seat_pack`: CUIT de la empresa que compra las vacantes. */
  companyCuit?: string;
}

/** Cotización sin crear nada (la pantalla de "Comprar para mi equipo" la muestra antes de pagar). */
export async function quotePurchase(
  tenant: Tenant,
  userId: string,
  input: CreateOrderInput,
): Promise<Result<{ quote: OrderQuote; tier: PricingTier; companyName: string | null; courseTitle: string }>> {
  const prepared = await prepare(tenant, userId, input, { createCompany: false });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    quote: prepared.quote,
    tier: prepared.tier,
    companyName: prepared.company?.legalName ?? null,
    courseTitle: prepared.tenantCourse.title,
  };
}

async function prepare(tenant: Tenant, userId: string, input: CreateOrderInput, options: { createCompany: boolean }) {
  const scoped = forTenant(tenant.id);
  const tenantCourse = await scoped.catalog.findBySlug(input.courseSlug);
  if (!tenantCourse || tenantCourse.status !== "published" || tenantCourse.visibility === "hidden") {
    return fail("not_available");
  }
  if (!tenantCourse.enrollmentOpen) return fail("not_available");

  const membership = await scoped.memberships.findByUserId(userId);
  if (!membership || !membership.onboardedAt) return fail("not_onboarded");

  let company: { id: string; legalName: string; isMember: boolean } | null = null;
  let quantity = 1;

  if (input.type === "individual") {
    const existing = await scoped.enrollments.findForCourse(userId, tenantCourse.courseId);
    const active =
      existing &&
      existing.status !== "revoked" &&
      existing.status !== "expired" &&
      !(existing.expiresAt && existing.expiresAt.getTime() < Date.now());
    if (active) return fail("already_enrolled");
    if (membership.companyId) company = await scoped.companies.findById(membership.companyId);
  } else {
    const cuit = normalizeCuit(input.companyCuit ?? "");
    if (!isValidCuit(cuit)) return fail("invalid_cuit");
    quantity = Math.trunc(input.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity < SEAT_PACK_MIN || quantity > tenant.seatPackMax) {
      return fail("invalid_quantity");
    }
    company = await scoped.companies.findByCuit(cuit);
    if (!company && options.createCompany) {
      // Igual que en el onboarding: un CUIT fuera del padrón se guarda como no socio.
      company = await scoped.companies.create({
        cuit,
        legalName: `Empresa ${formatCuit(cuit)}`,
        isMember: false,
        source: "self_declared",
      });
    }
  }

  const tier = resolvePurchaseTier({
    mode: tenant.memberValidationMode,
    type: input.type,
    buyer: { memberStatus: membership.memberStatus, companyId: membership.companyId },
    company: company ? { id: company.id, isMember: company.isMember } : null,
  });
  if (!canPurchaseCourse(tenantCourse.visibility, tier)) return fail("members_only");

  const quote = quoteOrder({
    unitPriceCents: getUnitPrice(tenantCourse, tier),
    quantity,
    platformFeeBps: tenant.platformFeeBps,
  });
  return { ok: true as const, tenantCourse, membership, company, tier, quote };
}

/**
 * Crea la orden con el precio calculado en el servidor (nunca el que mande el
 * cliente). Si el total es 0 se paga y se cumple al instante, sin proveedor.
 */
export async function createOrder(
  tenant: Tenant,
  userId: string,
  input: CreateOrderInput,
): Promise<Result<{ order: Order; free: boolean }>> {
  const prepared = await prepare(tenant, userId, input, { createCompany: true });
  if (!prepared.ok) return prepared;
  const { tenantCourse, company, tier, quote } = prepared;
  const scoped = forTenant(tenant.id);

  let order = await scoped.orders.create({
    number: await scoped.orders.nextNumber(tenant.shortName),
    buyerUserId: userId,
    companyId: company?.id ?? null,
    type: input.type,
    tier,
    quote,
    collectionMode: tenant.collectionMode,
    expiresAt: new Date(Date.now() + PENDING_ORDER_HOURS * HOUR),
    item: { tenantCourseId: tenantCourse.tenantCourseId, courseId: tenantCourse.courseId, courseTitle: tenantCourse.title },
  });
  log("order_created", { tenantId: tenant.id, orderId: order.id, total: order.totalCents, type: order.type });

  if (order.totalCents === 0) {
    const paid = await scoped.orders.markPaidAndFulfill(order.id);
    if (paid) order = paid.order;
    return { ok: true, order, free: true };
  }
  return { ok: true, order, free: false };
}

// ---------------------------------------------------------------------------
// Elegir medio de pago
// ---------------------------------------------------------------------------

/** Medios de pago disponibles para una cámara (habilitados y con proveedor implementado). */
export async function availableProviders(tenant: Tenant): Promise<ProviderId[]> {
  const ids: ProviderId[] = [];
  for (const id of tenant.paymentMethods) {
    const provider = getProvider(id);
    if (provider && (await provider.isAvailable(tenant))) ids.push(provider.id);
  }
  return ids;
}

export async function startCheckout(
  tenant: Tenant,
  buyerUserId: string,
  orderId: string,
  providerId: string,
): Promise<Result<{ next: { kind: "redirect"; url: string } | { kind: "instructions" } }>> {
  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order || order.buyerUserId !== buyerUserId) return fail("not_found");
  if (order.status !== "pending" && order.status !== "failed") return fail("invalid_state");
  if (order.totalCents === 0) return fail("invalid_state");

  const provider = getProvider(providerId);
  if (!provider || !(await availableProviders(tenant)).includes(provider.id)) return fail("provider_unavailable");

  const [items, buyer] = await Promise.all([scoped.orders.items(order.id), getUserProfile(buyerUserId)]);
  if (!buyer) return fail("not_found");

  const payment = await scoped.payments.create({
    orderId: order.id,
    provider: provider.id,
    status: "created",
    amountCents: order.totalCents,
  });
  const resultUrl = await buildTenantUrl(tenant.id, `/checkout/${order.id}/resultado`);
  const checkout = await provider.createCheckout({
    tenant,
    order,
    items,
    paymentId: payment.id,
    buyer: { email: buyer.email, firstName: buyer.firstName, lastName: buyer.lastName },
    urls: {
      success: resultUrl,
      failure: resultUrl,
      pending: resultUrl,
      notification: await buildTenantUrl(tenant.id, `/api/webhooks/${provider.id}?t=${tenant.id}`),
    },
  });
  await scoped.payments.update(payment.id, {
    status: checkout.payment.status === "created" ? "created" : "pending",
    externalId: checkout.payment.externalId ?? null,
    checkoutUrl: checkout.next.kind === "redirect" ? checkout.next.url : null,
  });

  const manual = provider.id === "manual";
  const expiresAt = new Date(
    Date.now() + (manual ? tenant.manualPaymentExpiryDays * 24 : PENDING_ORDER_HOURS) * HOUR,
  );
  const started = await scoped.orders.startPayment(order.id, {
    provider: provider.id,
    status: manual ? "awaiting_payment" : "pending",
    expiresAt,
  });
  if (!started) return fail("invalid_state");
  log("checkout_started", { tenantId: tenant.id, orderId: order.id, paymentId: payment.id, provider: provider.id });

  if (checkout.next.kind === "instructions") {
    const item = items[0];
    await notify(
      tenant,
      buyer.email,
      transferPendingEmail({
        tenant,
        orderNumber: order.number,
        courseTitle: item?.courseTitle ?? "",
        totalCents: order.totalCents,
        instructions: checkout.next.markdown,
        ordersUrl: await buildTenantUrl(tenant.id, `/mis-compras/${order.id}`),
      }),
    );
    return { ok: true, next: { kind: "instructions" } };
  }
  return { ok: true, next: checkout.next };
}

// ---------------------------------------------------------------------------
// Aplicar el estado de un pago
// ---------------------------------------------------------------------------

const PAYMENT_STATUS: Record<NormalizedPayment["status"], Payment["status"]> = {
  approved: "approved",
  pending: "pending",
  in_process: "in_process",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
};

/**
 * Único camino por el que un pago cambia el estado de una orden. Idempotente:
 * aplicar dos veces el mismo pago aprobado deja una sola inscripción (o los
 * mismos códigos) y manda un solo email. Nunca acredita un monto distinto al
 * total de la orden ni una orden de otra cámara.
 */
export async function applyPaymentUpdate(
  tenant: Tenant,
  provider: ProviderId,
  normalized: NormalizedPayment,
): Promise<Result<{ orderStatus: Order["status"]; newlyPaid: boolean }>> {
  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(normalized.externalReference);
  if (!order) {
    await scoped.payments.recordEvent({
      provider,
      topic: "payment",
      externalId: normalized.externalId,
      payload: normalized.raw,
      error: "order_not_found",
    });
    return fail("not_found");
  }

  const payment =
    (await scoped.payments.findByExternal(provider, normalized.externalId)) ??
    (await scoped.payments.latestForOrder(order.id));
  if (!payment || payment.orderId !== order.id || payment.provider !== provider) {
    await scoped.payments.recordEvent({
      provider,
      topic: "payment",
      externalId: normalized.externalId,
      payload: normalized.raw,
      error: "payment_not_found",
    });
    return fail("not_found");
  }

  if (normalized.status === "approved" && normalized.amountCents !== order.totalCents) {
    await scoped.payments.recordEvent({
      provider,
      topic: "payment",
      externalId: normalized.externalId,
      payload: normalized.raw,
      error: `amount_mismatch: ${normalized.amountCents} != ${order.totalCents}`,
    });
    log("payment_amount_mismatch", { tenantId: tenant.id, orderId: order.id, paymentId: payment.id });
    return fail("amount_mismatch");
  }

  // Un pago aprobado no se "desaprueba" por un aviso que llega tarde y desordenado.
  const keepApproved = payment.status === "approved" && normalized.status !== "refunded";
  if (!keepApproved) {
    await scoped.payments.update(payment.id, {
      status: PAYMENT_STATUS[normalized.status],
      feeCents: normalized.feeCents,
      raw: normalized.raw,
    });
  }
  await scoped.payments.recordEvent({
    provider,
    topic: "payment",
    externalId: normalized.externalId,
    payload: { status: normalized.status, amountCents: normalized.amountCents },
  });

  if (normalized.status === "approved") {
    const paid = await scoped.orders.markPaidAndFulfill(order.id);
    if (!paid) return fail("invalid_state");
    if (paid.newlyPaid) await announcePaid(tenant, paid.order);
    log("payment_approved", { tenantId: tenant.id, orderId: order.id, paymentId: payment.id, newlyPaid: paid.newlyPaid });
    return { ok: true, orderStatus: paid.order.status, newlyPaid: paid.newlyPaid };
  }

  if (normalized.status === "rejected" || normalized.status === "cancelled") {
    const failed = await scoped.orders.markFailed(order.id);
    if (failed && normalized.status === "rejected") await announceRejected(tenant, failed);
    return { ok: true, orderStatus: failed?.status ?? order.status, newlyPaid: false };
  }

  return { ok: true, orderStatus: order.status, newlyPaid: false };
}

async function orderContext(tenant: Tenant, order: Order) {
  const scoped = forTenant(tenant.id);
  const [items, buyer] = await Promise.all([scoped.orders.items(order.id), getUserProfile(order.buyerUserId)]);
  return { item: items[0], buyer };
}

async function announcePaid(tenant: Tenant, order: Order) {
  if (order.totalCents === 0) return;
  const { item, buyer } = await orderContext(tenant, order);
  if (!item || !buyer) return;
  const slug = await courseSlug(tenant, item.courseId);
  await notify(
    tenant,
    buyer.email,
    paymentApprovedEmail({
      tenant,
      orderNumber: order.number,
      courseTitle: item.courseTitle,
      kind: order.type,
      quantity: item.quantity,
      url: await buildTenantUrl(tenant.id, order.type === "seat_pack" ? `/mis-compras/${order.id}` : `/aprender/${slug}`),
    }),
  );
}

async function announceRejected(tenant: Tenant, order: Order) {
  const { item, buyer } = await orderContext(tenant, order);
  if (!item || !buyer) return;
  await notify(
    tenant,
    buyer.email,
    paymentRejectedEmail({
      tenant,
      orderNumber: order.number,
      courseTitle: item.courseTitle,
      url: await buildTenantUrl(tenant.id, `/checkout/${order.id}`),
    }),
  );
}

async function courseSlug(tenant: Tenant, courseId: string): Promise<string> {
  const assigned = await forTenant(tenant.id).catalog.listAssigned();
  return assigned.find((c) => c.courseId === courseId)?.slug ?? "";
}

// ---------------------------------------------------------------------------
// Transferencias, cancelaciones y vencimientos
// ---------------------------------------------------------------------------

async function isTenantAdmin(tenant: Tenant, userId: string): Promise<boolean> {
  const membership = await forTenant(tenant.id).memberships.findByUserId(userId);
  return membership?.role === "tenant_admin";
}

/**
 * El admin confirma que llegó la transferencia. Solo para órdenes de
 * transferencia; deja el pago como `approved` con quién y qué nro. de
 * operación, y queda en `audit_log` (`order.mark_paid`).
 */
export async function markManualPaymentAsPaid(
  tenant: Tenant,
  adminUserId: string,
  orderId: string,
  reference?: string | null,
): Promise<Result<{ order: Order }>> {
  if (!(await isTenantAdmin(tenant, adminUserId))) return fail("forbidden");

  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order) return fail("not_found");
  if (order.paymentProvider !== "manual") return fail("invalid_state");
  // Marcar dos veces la misma transferencia es inocuo: no repite nada.
  if (order.status === "paid") return { ok: true, order };
  if (order.status !== "awaiting_payment" && order.status !== "expired") return fail("invalid_state");

  const payment = await scoped.payments.latestForOrder(order.id);
  if (!payment || payment.provider !== "manual") return fail("invalid_state");

  await scoped.payments.update(payment.id, {
    status: "approved",
    markedByUserId: adminUserId,
    manualReference: reference?.trim() || null,
  });
  const paid = await scoped.orders.markPaidAndFulfill(order.id);
  if (!paid) return fail("invalid_state");

  if (paid.newlyPaid) {
    await scoped.auditLog.record({
      actorUserId: adminUserId,
      action: "order.mark_paid",
      entityType: "order",
      entityId: order.id,
      data: { number: order.number, totalCents: order.totalCents, reference: reference?.trim() || null },
    });
    await announcePaid(tenant, paid.order);
  }
  log("manual_payment_marked", { tenantId: tenant.id, orderId: order.id, adminUserId });
  return { ok: true, order: paid.order };
}

/** Cancela una orden abierta: la persona que compró la suya, o un admin cualquiera. */
export async function cancelOrder(
  tenant: Tenant,
  actorUserId: string,
  orderId: string,
): Promise<Result<{ order: Order }>> {
  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order) return fail("not_found");

  const admin = await isTenantAdmin(tenant, actorUserId);
  if (order.buyerUserId !== actorUserId && !admin) return fail("forbidden");

  const cancelled = await scoped.orders.cancel(order.id);
  if (!cancelled) return fail("invalid_state");

  const payment = await scoped.payments.latestForOrder(order.id);
  if (payment && payment.status !== "approved") await scoped.payments.update(payment.id, { status: "cancelled" });
  if (admin && order.buyerUserId !== actorUserId) {
    await scoped.auditLog.record({
      actorUserId,
      action: "order.cancel",
      entityType: "order",
      entityId: order.id,
      data: { number: order.number },
    });
  }
  return { ok: true, order: cancelled };
}

// ---------------------------------------------------------------------------
// Vacantes
// ---------------------------------------------------------------------------

/** Manda un código a cada email (hasta donde alcancen los códigos disponibles). */
export async function sendSeatInvites(
  tenant: Tenant,
  buyerUserId: string,
  orderId: string,
  emails: string[],
): Promise<Result<{ sent: string[]; withoutCode: string[] }>> {
  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order || order.buyerUserId !== buyerUserId || order.type !== "seat_pack") return fail("not_found");
  if (order.status !== "paid") return fail("invalid_state");

  const [items, buyer, codes] = await Promise.all([
    scoped.orders.items(order.id),
    getUserProfile(buyerUserId),
    scoped.seatCodes.listForOrder(order.id),
  ]);
  const item = items[0];
  if (!item || !buyer) return fail("not_found");

  const free = codes.filter((c) => c.status === "available");
  const sent: string[] = [];
  const withoutCode: string[] = [];
  for (const email of emails) {
    const seat = free.shift();
    if (!seat) {
      withoutCode.push(email);
      continue;
    }
    const marked = await scoped.seatCodes.markSent(seat.id, email);
    if (!marked) {
      withoutCode.push(email);
      continue;
    }
    await notify(
      tenant,
      email,
      seatInviteEmail({
        tenant,
        courseTitle: item.courseTitle,
        buyerName: buyer.firstName && buyer.lastName ? `${buyer.firstName} ${buyer.lastName}` : buyer.email,
        code: seat.code,
        redeemUrl: await buildTenantUrl(tenant.id, `/canjear?codigo=${seat.code}`),
      }),
    );
    sent.push(email);
  }
  return { ok: true, sent, withoutCode };
}

export type RedeemOutcome = Result<{ courseSlug: string }>;

/** Canje de un código por el usuario logueado y onboardeado. */
export async function redeemSeatCode(tenant: Tenant, userId: string, rawCode: string) {
  const code = normalizeSeatCode(rawCode);
  if (!code) return { ok: false as const, error: "invalid" as const };

  const scoped = forTenant(tenant.id);
  const membership = await scoped.memberships.findByUserId(userId);
  if (!membership || !membership.onboardedAt) return { ok: false as const, error: "not_onboarded" as const };

  const result = await scoped.seatCodes.redeem(code, userId);
  if (!result.ok) return { ok: false as const, error: result.reason };
  log("seat_redeemed", { tenantId: tenant.id, userId });
  return { ok: true as const, slug: await courseSlug(tenant, result.courseId) };
}

/** El admin crea vacantes sin orden (una empresa que pagó por fuera). */
export async function createAdminSeatCodes(
  tenant: Tenant,
  adminUserId: string,
  input: { courseSlug: string; companyId: string | null; quantity: number },
): Promise<Result<{ count: number }>> {
  if (!(await isTenantAdmin(tenant, adminUserId))) return fail("forbidden");
  const scoped = forTenant(tenant.id);
  const quantity = Math.trunc(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > tenant.seatPackMax) return fail("invalid_quantity");

  const tenantCourse = await scoped.catalog.findBySlug(input.courseSlug);
  if (!tenantCourse || tenantCourse.status !== "published") return fail("not_available");
  if (input.companyId && !(await scoped.companies.findById(input.companyId))) return fail("not_found");

  const created = await scoped.seatCodes.createWithoutOrder({
    courseId: tenantCourse.courseId,
    tenantCourseId: tenantCourse.tenantCourseId,
    companyId: input.companyId,
    quantity,
    createdByUserId: adminUserId,
  });
  await scoped.auditLog.record({
    actorUserId: adminUserId,
    action: "seat_codes.create",
    entityType: "course",
    entityId: tenantCourse.courseId,
    data: { quantity: created.length, companyId: input.companyId, courseSlug: input.courseSlug },
  });
  return { ok: true, count: created.length };
}

// ---------------------------------------------------------------------------
// Socios pendientes
// ---------------------------------------------------------------------------

/** Aprueba o rechaza un pedido de socio `pending` (docs/01, modos `cuit_email_domain` y `manual`). */
export async function decideMember(
  tenant: Tenant,
  adminUserId: string,
  membershipId: string,
  approve: boolean,
): Promise<Result> {
  if (!(await isTenantAdmin(tenant, adminUserId))) return fail("forbidden");
  const scoped = forTenant(tenant.id);
  const target = await scoped.memberships.findPendingById(membershipId);
  if (!target) return fail("not_found");

  const updated = await scoped.memberships.update(membershipId, {
    memberStatus: approve ? "verified" : "rejected",
    memberReviewedBy: adminUserId,
    memberReviewedAt: new Date(),
  });
  if (!updated) return fail("not_found");
  // Aprobar a alguien de una empresa que todavía no figura como socia la marca como tal.
  if (approve && target.companyId) await scoped.companies.markMember(target.companyId);

  await scoped.auditLog.record({
    actorUserId: adminUserId,
    action: approve ? "member.approve" : "member.reject",
    entityType: "tenant_membership",
    entityId: membershipId,
    data: { userId: target.userId, companyId: target.companyId },
  });
  const user = await getUserProfile(target.userId);
  if (user) {
    await notify(
      tenant,
      user.email,
      memberDecisionEmail({ tenant, approved: approve, url: await buildTenantUrl(tenant.id, "/cursos") }),
    );
  }
  return { ok: true };
}
