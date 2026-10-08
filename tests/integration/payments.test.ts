import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { expireStaleOrders } from "@/lib/db/scope/orders";
import { auditLog, enrollments, orders, payments, seatCodes, tenantMemberships, users } from "@/lib/db/schema";
import { forTenant } from "@/lib/db/tenant-scope";
import {
  applyPaymentUpdate,
  cancelOrder,
  createAdminSeatCodes,
  createOrder,
  decideMember,
  markManualPaymentAsPaid,
  redeemSeatCode,
  sendSeatInvites,
  startCheckout,
} from "@/lib/payments/service";
import { getTenantBySlug, type Tenant } from "@/lib/tenant/resolve";

import { createTestStudent, deleteTestUser, setMemberStatus } from "../e2e/db";

// Cada consulta a Neon desde una notebook tarda ~170 ms: estos tests encadenan muchas.
vi.setConfig({ testTimeout: 240_000, hookTimeout: 300_000 });

// docs/04-pagos.md, "Tests obligatorios" (los que no son de Mercado Pago).
// Alumnos descartables `*@civa.demo` / `*@ribera.demo`: sus emails quedan en el log.
const COURSE = "eficiencia-energetica-pymes-industriales";
const run = Math.random().toString(36).slice(2, 7);
const emails: string[] = [];

let civa: Tenant;
let ribera: Tenant;
let adminId: string;
let riberaAdminId: string;

async function buyer(label: string, options: { tenant?: Tenant; member?: boolean } = {}) {
  const tenant = options.tenant ?? civa;
  const email = `t4-${label}-${run}@${tenant.slug}.demo`;
  emails.push(email);
  const { userId } = await createTestStudent({
    email,
    tenantSlug: tenant.slug,
    companyName: options.member ? (tenant.slug === "civa" ? "Talleres Brisco S.A." : "Comercial Ribera Norte S.A.") : undefined,
    memberStatus: options.member ? "verified" : "none",
  });
  return { email, userId, tenant };
}

const approved = (order: { id: string; totalCents: number }, externalId: string) => ({
  externalId,
  externalReference: order.id,
  status: "approved" as const,
  amountCents: order.totalCents,
  feeCents: 0,
  raw: { test: true },
});

/** Crea una orden individual y le arranca el pago simulado: devuelve la orden y el id de pago externo. */
async function startMockOrder(userId: string, type: "individual" | "seat_pack" = "individual", quantity = 10) {
  const created = await createOrder(
    civa,
    userId,
    type === "individual"
      ? { courseSlug: COURSE, type }
      : { courseSlug: COURSE, type, quantity, companyCuit: await memberCuit() },
  );
  if (!created.ok) throw new Error(`createOrder falló: ${created.error}`);
  const started = await startCheckout(civa, userId, created.order.id, "mock");
  if (!started.ok) throw new Error(`startCheckout falló: ${started.error}`);
  const payment = await forTenant(civa.id).payments.latestForOrder(created.order.id);
  return { order: created.order, payment: payment! };
}

async function memberCuit() {
  const company = (await forTenant(civa.id).companies.list()).find((c) => c.legalName === "Talleres Brisco S.A.")!;
  return company.cuit;
}

beforeAll(async () => {
  civa = (await getTenantBySlug("civa"))!;
  ribera = (await getTenantBySlug("ribera"))!;
  const [admin] = await db.select().from(users).where(eq(users.email, "admin@civa.demo"));
  const [rAdmin] = await db.select().from(users).where(eq(users.email, "admin@ribera.demo"));
  adminId = admin.id;
  riberaAdminId = rAdmin.id;
});

afterAll(async () => {
  // De a tandas en paralelo: cada borrado son varias consultas a Neon.
  for (let i = 0; i < emails.length; i += 6) await Promise.all(emails.slice(i, i + 6).map(deleteTestUser));
});

describe("crear la orden: el precio sale del servidor", () => {
  it("no socio paga el precio general; socio verificado paga el de socio; todo en centavos enteros", async () => {
    const guest = await buyer("nonmember");
    const member = await buyer("member", { member: true });

    const a = await createOrder(civa, guest.userId, { courseSlug: COURSE, type: "individual" });
    const b = await createOrder(civa, member.userId, { courseSlug: COURSE, type: "individual" });
    expect(a.ok && a.order).toMatchObject({ totalCents: 9_000_000, pricingTier: "non_member", status: "pending", type: "individual" });
    expect(b.ok && b.order).toMatchObject({ totalCents: 4_500_000, pricingTier: "member", status: "pending" });
    // comisión de la plataforma fijada al crear (CIVA: 30%)
    expect(b.ok && b.order.platformFeeCents).toBe(1_350_000);
    expect(a.ok && a.order.number).toMatch(/^CIVA-\d{6}$/);
    expect(a.ok && b.ok && a.order.number).not.toBe(b.ok && b.order.number);
  });

  it("no deja comprar dos veces un curso en el que ya está inscripto", async () => {
    const { userId } = await buyer("dup", { member: true });
    const first = await startMockOrder(userId);
    await applyPaymentUpdate(civa, "mock", approved(first.order, first.payment.externalId!));
    expect(await createOrder(civa, userId, { courseSlug: COURSE, type: "individual" })).toEqual({ ok: false, error: "already_enrolled" });
  });

  it("orden de total 0 → inscripción sin pasar por proveedor", async () => {
    const { userId } = await buyer("free", { tenant: ribera, member: true });
    const result = await createOrder(ribera, userId, { courseSlug: COURSE, type: "individual" });
    expect(result.ok && result.free).toBe(true);
    expect(result.ok && result.order).toMatchObject({ status: "paid", totalCents: 0 });
    expect(result.ok && result.order.fulfilledAt).not.toBeNull();
    expect(result.ok && result.order.paymentProvider).toBeNull();
    const enrollment = await forTenant(ribera.id).enrollments.findForCourse(userId, (await forTenant(ribera.id).catalog.findBySlug(COURSE))!.courseId);
    expect(enrollment).toMatchObject({ source: "free", status: "active" });
    // y no tiene pagos
    expect(await db.select().from(payments).where(eq(payments.orderId, result.ok ? result.order.id : ""))).toHaveLength(0);
  });

  it("valida cantidad y CUIT de las vacantes", async () => {
    const { userId } = await buyer("validate", { member: true });
    const cuit = await memberCuit();
    expect(await createOrder(civa, userId, { courseSlug: COURSE, type: "seat_pack", quantity: 1, companyCuit: cuit })).toEqual({ ok: false, error: "invalid_quantity" });
    expect(await createOrder(civa, userId, { courseSlug: COURSE, type: "seat_pack", quantity: civa.seatPackMax + 1, companyCuit: cuit })).toEqual({ ok: false, error: "invalid_quantity" });
    expect(await createOrder(civa, userId, { courseSlug: COURSE, type: "seat_pack", quantity: 5, companyCuit: "20-12345678-0" })).toEqual({ ok: false, error: "invalid_cuit" });
    expect(await createOrder(civa, userId, { courseSlug: "no-existe", type: "individual" })).toEqual({ ok: false, error: "not_available" });
  });
});

describe("applyPaymentUpdate", () => {
  it("el mismo pago aprobado dos veces (y en paralelo) deja una sola inscripción", async () => {
    const { userId } = await buyer("idem", { member: true });
    const { order, payment } = await startMockOrder(userId);
    const update = approved(order, payment.externalId!);

    const results = await Promise.all([applyPaymentUpdate(civa, "mock", update), applyPaymentUpdate(civa, "mock", update)]);
    await applyPaymentUpdate(civa, "mock", update);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.newlyPaid)).toHaveLength(1);

    const rows = await db.select().from(enrollments).where(eq(enrollments.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "purchase", orderId: order.id });
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(fresh).toMatchObject({ status: "paid" });
    expect(fresh.fulfilledAt).not.toBeNull();
    expect(fresh.paidAt).not.toBeNull();
  });

  it("paquete de 10 aprobado → exactamente 10 códigos, aunque se repita", async () => {
    const { userId } = await buyer("pack", { member: true });
    const { order, payment } = await startMockOrder(userId, "seat_pack", 10);
    expect(order).toMatchObject({ type: "seat_pack", totalCents: 45_000_000, pricingTier: "member" });

    await Promise.all([
      applyPaymentUpdate(civa, "mock", approved(order, payment.externalId!)),
      applyPaymentUpdate(civa, "mock", approved(order, payment.externalId!)),
    ]);
    await applyPaymentUpdate(civa, "mock", approved(order, payment.externalId!));

    const codes = await db.select().from(seatCodes).where(eq(seatCodes.orderId, order.id));
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((c) => c.code)).size).toBe(10);
    expect(codes.every((c) => c.status === "available" && c.companyId === order.companyId)).toBe(true);
  });

  it("un monto distinto al total NO acredita", async () => {
    const { userId } = await buyer("mismatch", { member: true });
    const { order, payment } = await startMockOrder(userId);
    const result = await applyPaymentUpdate(civa, "mock", { ...approved(order, payment.externalId!), amountCents: order.totalCents - 1 });
    expect(result).toEqual({ ok: false, error: "amount_mismatch" });
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(fresh.status).toBe("pending");
    expect(await db.select().from(enrollments).where(eq(enrollments.userId, userId))).toHaveLength(0);
  });

  it("una orden de otra cámara es rechazada", async () => {
    const { userId } = await buyer("crosstenant", { member: true });
    const { order, payment } = await startMockOrder(userId);
    // Ribera intenta acreditar la orden de CIVA con la referencia de CIVA.
    const result = await applyPaymentUpdate(ribera, "mock", approved(order, payment.externalId!));
    expect(result).toEqual({ ok: false, error: "not_found" });
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(fresh.status).toBe("pending");
  });

  it("rechazado → la orden falla y se puede reintentar con otro pago", async () => {
    const { userId } = await buyer("reject", { member: true });
    const { order, payment } = await startMockOrder(userId);
    const rejected = await applyPaymentUpdate(civa, "mock", { ...approved(order, payment.externalId!), status: "rejected" });
    expect(rejected.ok && rejected.orderStatus).toBe("failed");

    const retry = await startCheckout(civa, userId, order.id, "mock");
    expect(retry.ok).toBe(true);
    const second = await forTenant(civa.id).payments.latestForOrder(order.id);
    expect(second!.id).not.toBe(payment.id);
    await applyPaymentUpdate(civa, "mock", approved(order, second!.externalId!));
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(fresh.status).toBe("paid");
  });

  it("un aviso viejo 'pendiente' no desaprueba un pago ya aprobado", async () => {
    const { userId } = await buyer("order", { member: true });
    const { order, payment } = await startMockOrder(userId);
    await applyPaymentUpdate(civa, "mock", approved(order, payment.externalId!));
    await applyPaymentUpdate(civa, "mock", { ...approved(order, payment.externalId!), status: "pending" });
    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(row.status).toBe("approved");
  });
});

describe("transferencia (proveedor manual)", () => {
  async function transferOrder(userId: string) {
    const created = await createOrder(civa, userId, { courseSlug: COURSE, type: "individual" });
    if (!created.ok) throw new Error(created.error);
    const started = await startCheckout(civa, userId, created.order.id, "manual");
    expect(started).toEqual({ ok: true, next: { kind: "instructions" } });
    return created.order;
  }

  it("queda esperando; el admin la marca pagada y queda inscripto, con auditoría", async () => {
    const { userId } = await buyer("transfer");
    const order = await transferOrder(userId);
    const [waiting] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(waiting.status).toBe("awaiting_payment");
    expect(waiting.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(await db.select().from(enrollments).where(eq(enrollments.userId, userId))).toHaveLength(0);

    const paid = await markManualPaymentAsPaid(civa, adminId, order.id, "OP-12345");
    expect(paid.ok && paid.order.status).toBe("paid");
    expect(await db.select().from(enrollments).where(eq(enrollments.userId, userId))).toHaveLength(1);

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(payment).toMatchObject({ status: "approved", markedByUserId: adminId, manualReference: "OP-12345" });
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, order.id));
    expect(audit.map((a) => a.action)).toContain("order.mark_paid");

    // Marcar dos veces no duplica nada.
    const again = await markManualPaymentAsPaid(civa, adminId, order.id, "OP-12345");
    expect(again.ok).toBe(true);
    expect(await db.select().from(enrollments).where(eq(enrollments.userId, userId))).toHaveLength(1);
    expect((await db.select().from(auditLog).where(eq(auditLog.entityId, order.id))).filter((a) => a.action === "order.mark_paid")).toHaveLength(1);
  });

  it("marcarla pagada un usuario que no es admin → forbidden (y nada cambia)", async () => {
    const { userId } = await buyer("transfer-forbidden");
    const other = await buyer("not-admin");
    const order = await transferOrder(userId);
    expect(await markManualPaymentAsPaid(civa, other.userId, order.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await markManualPaymentAsPaid(civa, userId, order.id)).toEqual({ ok: false, error: "forbidden" }); // ni el propio comprador
    const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(fresh.status).toBe("awaiting_payment");
  });

  it("un admin de otra cámara no puede marcarla", async () => {
    const { userId } = await buyer("transfer-cross");
    const order = await transferOrder(userId);
    expect(await markManualPaymentAsPaid(civa, riberaAdminId, order.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await markManualPaymentAsPaid(ribera, riberaAdminId, order.id)).toEqual({ ok: false, error: "not_found" });
  });

  it("solo el comprador o un admin cancelan; una orden vencida se puede marcar pagada si llegó la transferencia", async () => {
    const { userId } = await buyer("cancel");
    const stranger = await buyer("cancel-stranger");
    const order = await transferOrder(userId);
    expect(await cancelOrder(civa, stranger.userId, order.id)).toEqual({ ok: false, error: "forbidden" });

    await db.update(orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, order.id));
    const expired = await expireStaleOrders(new Date(), [order.id]);
    expect(expired.map((o) => o.id)).toEqual([order.id]);
    const late = await markManualPaymentAsPaid(civa, adminId, order.id, "tarde");
    expect(late.ok && late.order.status).toBe("paid");

    const other = await buyer("cancel-2");
    const toCancel = await transferOrder(other.userId);
    const cancelled = await cancelOrder(civa, other.userId, toCancel.id);
    expect(cancelled.ok && cancelled.order.status).toBe("cancelled");
    expect(await markManualPaymentAsPaid(civa, adminId, toCancel.id)).toEqual({ ok: false, error: "invalid_state" });
  });
});

describe("vencimiento de órdenes", () => {
  it("expira lo abierto y vencido, y no toca lo pagado ni lo vigente", async () => {
    const a = await buyer("exp-a");
    const b = await buyer("exp-b", { member: true });
    const c = await buyer("exp-c");
    const open = await createOrder(civa, a.userId, { courseSlug: COURSE, type: "individual" });
    const paid = await startMockOrder(b.userId);
    await applyPaymentUpdate(civa, "mock", approved(paid.order, paid.payment.externalId!));
    const fresh = await createOrder(civa, c.userId, { courseSlug: COURSE, type: "individual" });
    if (!open.ok || !fresh.ok) throw new Error("setup");

    const past = new Date(Date.now() - 3_600_000);
    await db.update(orders).set({ expiresAt: past }).where(inArray(orders.id, [open.order.id, paid.order.id]));

    const expired = await expireStaleOrders(new Date(), [open.order.id, paid.order.id, fresh.order.id]);
    expect(expired.map((o) => o.id)).toEqual([open.order.id]);
    const statuses = Object.fromEntries((await db.select().from(orders).where(inArray(orders.id, [open.order.id, paid.order.id, fresh.order.id]))).map((o) => [o.id, o.status]));
    expect(statuses).toEqual({ [open.order.id]: "expired", [paid.order.id]: "paid", [fresh.order.id]: "pending" });
  });
});

describe("vacantes: envío y canje", () => {
  async function paidPack(label: string, quantity = 4) {
    const { userId, email } = await buyer(label, { member: true });
    const { order, payment } = await startMockOrder(userId, "seat_pack", quantity);
    await applyPaymentUpdate(civa, "mock", approved(order, payment.externalId!));
    const codes = await forTenant(civa.id).seatCodes.listForOrder(order.id);
    return { userId, email, order, codes };
  }

  it("envía solo hasta donde alcanzan los códigos y los marca como enviados", async () => {
    const { userId, order, codes } = await paidPack("send", 3);
    expect(codes).toHaveLength(3);
    const names = ["a", "b", "c", "d"].map((n) => `t4-invite-${n}-${run}@civa.demo`);
    emails.push(...names);

    const result = await sendSeatInvites(civa, userId, order.id, names);
    expect(result.ok && result.sent).toEqual(names.slice(0, 3));
    expect(result.ok && result.withoutCode).toEqual([names[3]]);
    const after = await forTenant(civa.id).seatCodes.listForOrder(order.id);
    expect(after.every((c) => c.status === "sent")).toBe(true);
    expect(after.map((c) => c.sentToEmail).sort()).toEqual(names.slice(0, 3).sort());

    // Solo quien compró puede enviar.
    const stranger = await buyer("send-stranger");
    expect(await sendSeatInvites(civa, stranger.userId, order.id, ["x@civa.demo"])).toEqual({ ok: false, error: "not_found" });
  });

  it("se canjea una sola vez, queda inscripto y hereda la empresa del comprador", async () => {
    const { order, codes } = await paidPack("redeem");
    const employee = await buyer("employee");
    const code = codes[0].code;

    const first = await redeemSeatCode(civa, employee.userId, code.toLowerCase());
    expect(first).toMatchObject({ ok: true, slug: COURSE });
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.userId, employee.userId));
    expect(enrollment).toMatchObject({ source: "seat_code", status: "active" });
    const [membership] = await db.select().from(tenantMemberships).where(eq(tenantMemberships.userId, employee.userId));
    expect(membership.companyId).toBe(order.companyId);

    const other = await buyer("employee-2");
    expect(await redeemSeatCode(civa, other.userId, code)).toEqual({ ok: false, error: "redeemed" });
    expect(await redeemSeatCode(civa, other.userId, "ZZZZ-ZZZZ")).toEqual({ ok: false, error: "not_found" });
    expect(await redeemSeatCode(civa, other.userId, "basura")).toEqual({ ok: false, error: "invalid" });
  });

  it("dos personas canjeando el mismo código a la vez: gana una sola", async () => {
    const { codes } = await paidPack("race");
    const a = await buyer("race-a");
    const b = await buyer("race-b");
    const results = await Promise.all([redeemSeatCode(civa, a.userId, codes[0].code), redeemSeatCode(civa, b.userId, codes[0].code)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const redeemers = await db.select().from(seatCodes).where(eq(seatCodes.code, codes[0].code));
    expect(redeemers[0].status).toBe("redeemed");
    const total = await db.select().from(enrollments).where(inArray(enrollments.userId, [a.userId, b.userId]));
    expect(total).toHaveLength(1);
  });

  it("si ya está inscripto, el canje falla y el código NO se consume", async () => {
    const { codes } = await paidPack("already");
    const student = await buyer("already-student", { member: true });
    const bought = await startMockOrder(student.userId);
    await applyPaymentUpdate(civa, "mock", approved(bought.order, bought.payment.externalId!));

    expect(await redeemSeatCode(civa, student.userId, codes[1].code)).toEqual({ ok: false, error: "already_enrolled" });
    const [row] = await db.select().from(seatCodes).where(eq(seatCodes.code, codes[1].code));
    expect(row.status).toBe("available");
    expect(row.redeemedByUserId).toBeNull();
  });

  it("un código anulado no se canjea", async () => {
    const { codes } = await paidPack("revoked");
    const scoped = forTenant(civa.id);
    await scoped.seatCodes.revoke(codes[0].id);
    const employee = await buyer("revoked-employee");
    expect(await redeemSeatCode(civa, employee.userId, codes[0].code)).toEqual({ ok: false, error: "revoked" });
  });

  it("el admin crea vacantes sin orden; otro usuario no puede", async () => {
    const guest = await buyer("admin-codes");
    expect(await createAdminSeatCodes(civa, guest.userId, { courseSlug: COURSE, companyId: null, quantity: 3 })).toEqual({ ok: false, error: "forbidden" });
    const before = new Set((await db.select({ id: seatCodes.id }).from(seatCodes).where(eq(seatCodes.createdByUserId, adminId))).map((c) => c.id));
    const created = await createAdminSeatCodes(civa, adminId, { courseSlug: COURSE, companyId: null, quantity: 3 });
    expect(created).toEqual({ ok: true, count: 3 });
    const added = (await db.select().from(seatCodes).where(eq(seatCodes.createdByUserId, adminId))).filter((c) => !before.has(c.id));
    expect(added).toHaveLength(3);
    expect(added.every((c) => c.orderId === null && c.status === "available")).toBe(true);
    // Limpieza: solo los 3 códigos que creó este test.
    await db.delete(seatCodes).where(inArray(seatCodes.id, added.map((c) => c.id)));
  });
});

describe("socios pendientes", () => {
  it("aprobar pasa a verificado y paga precio de socio; solo un admin de esa cámara", async () => {
    const { userId, email } = await buyer("pending");
    await setMemberStatus(email, "civa", "pending");
    const scoped = forTenant(civa.id);
    const [membership] = await db.select().from(tenantMemberships).where(eq(tenantMemberships.userId, userId));

    expect(await decideMember(civa, userId, membership.id, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await decideMember(ribera, riberaAdminId, membership.id, true)).toEqual({ ok: false, error: "not_found" });

    expect(await decideMember(civa, adminId, membership.id, false)).toEqual({ ok: true });
    expect((await scoped.memberships.findByUserId(userId))?.memberStatus).toBe("rejected");
    // Ya no está pendiente: no se puede decidir dos veces.
    expect(await decideMember(civa, adminId, membership.id, true)).toEqual({ ok: false, error: "not_found" });
  });
});

describe("aislamiento entre cámaras", () => {
  it("Ribera no ve ni toca las órdenes, pagos y vacantes de CIVA", async () => {
    const { userId } = await buyer("iso", { member: true });
    const { order, payment } = await startMockOrder(userId, "seat_pack", 3);
    await applyPaymentUpdate(civa, "mock", approved(order, payment.externalId!));
    const code = (await forTenant(civa.id).seatCodes.listForOrder(order.id))[0];

    const other = forTenant(ribera.id);
    expect(await other.orders.findById(order.id)).toBeNull();
    expect(await other.orders.items(order.id)).toEqual([]);
    expect(await other.payments.findById(payment.id)).toBeNull();
    expect(await other.payments.latestForOrder(order.id)).toBeNull();
    expect(await other.seatCodes.findByCode(code.code)).toBeNull();
    expect(await other.seatCodes.listForOrder(order.id)).toEqual([]);
    expect((await other.orders.listForAdmin({ q: order.number })).map((o) => o.id)).not.toContain(order.id);
    expect(await other.orders.cancel(order.id)).toBeNull();
    expect(await other.orders.markPaidAndFulfill(order.id)).toBeNull();
    const riberaUser = await buyer("iso-ribera", { tenant: ribera });
    expect(await redeemSeatCode(ribera, riberaUser.userId, code.code)).toEqual({ ok: false, error: "not_found" });
  });
});
