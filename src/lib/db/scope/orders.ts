// Órdenes, pagos y vacantes 🔒. Solo se usan a través de `forTenant()`: cada
// consulta filtra por `tenant_id`. Los cambios de estado son condicionales
// (`where status in (...)`) para que un request repetido no pueda repetirlos:
// una orden pasa a `paid` y se cumple (`fulfilled_at`) una sola vez.
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";

import { generateSeatCodes } from "@/lib/seat-codes";
import type { OrderQuote } from "@/lib/pricing";

import { db } from "../index";
import {
  companies,
  courses,
  enrollments,
  orderCounters,
  orderItems,
  orders,
  paymentEvents,
  payments,
  seatCodes,
  tenantCourses,
  tenantMemberships,
  users,
} from "../schema";

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type SeatCode = typeof seatCodes.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PAYABLE_FROM = ["pending", "awaiting_payment", "failed", "expired"] as const;
const OPEN_STATUSES = ["pending", "awaiting_payment"] as const;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface OrderAdminFilters {
  q?: string;
  status?: Order["status"];
  /** Solo transferencias esperando confirmación. */
  pendingTransfers?: boolean;
  from?: Date;
  to?: Date;
}

export type RedeemResult =
  | { ok: true; courseId: string; tenantCourseId: string; enrollmentId: string }
  | { ok: false; reason: "not_found" | "revoked" | "redeemed" | "expired" | "already_enrolled" };

export function orderScope(tenantId: string) {
  /** Cumplimiento de una orden pagada (dentro de la transacción del pago). */
  async function fulfill(tx: Tx, order: Order) {
    const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    if (!item) throw new Error(`La orden ${order.number} no tiene ítems`);

    if (order.type === "individual") {
      const [tenantCourse] = await tx.select().from(tenantCourses).where(eq(tenantCourses.id, item.tenantCourseId));
      const expiresAt = tenantCourse?.accessDays ? new Date(Date.now() + tenantCourse.accessDays * 86_400_000) : null;
      await tx
        .insert(enrollments)
        .values({
          tenantId,
          userId: order.buyerUserId,
          courseId: item.courseId,
          tenantCourseId: item.tenantCourseId,
          source: order.totalCents === 0 ? "free" : "purchase",
          orderId: order.id,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [enrollments.tenantId, enrollments.userId, enrollments.courseId],
          // Si ya tenía una inscripción dada de baja o vencida, comprar la reactiva.
          set: {
            status: "active",
            source: order.totalCents === 0 ? "free" : "purchase",
            orderId: order.id,
            expiresAt,
            enrolledAt: new Date(),
          },
          setWhere: inArray(enrollments.status, ["revoked", "expired"]),
        });
    } else {
      let remaining = item.quantity;
      while (remaining > 0) {
        const inserted = await tx
          .insert(seatCodes)
          .values(
            generateSeatCodes(remaining).map((code) => ({
              tenantId,
              courseId: item.courseId,
              tenantCourseId: item.tenantCourseId,
              orderId: order.id,
              companyId: order.companyId,
              code,
              createdByUserId: order.buyerUserId,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: seatCodes.id });
        remaining -= inserted.length;
      }
    }
    await tx.update(orders).set({ fulfilledAt: new Date() }).where(eq(orders.id, order.id));
  }

  return {
    orders: {
      /** `CIVA-000123`, secuencial por cámara (contador atómico). */
      async nextNumber(shortName: string): Promise<string> {
        const [row] = await db
          .insert(orderCounters)
          .values({ tenantId, lastNumber: 1 })
          .onConflictDoUpdate({ target: orderCounters.tenantId, set: { lastNumber: sql`${orderCounters.lastNumber} + 1` } })
          .returning({ n: orderCounters.lastNumber });
        const prefix = shortName.toUpperCase().replace(/[^A-Z0-9]/g, "") || "ORD";
        return `${prefix}-${String(row.n).padStart(6, "0")}`;
      },

      /** Orden + ítem en una transacción. */
      async create(data: {
        number: string;
        buyerUserId: string;
        companyId: string | null;
        type: Order["type"];
        tier: Order["pricingTier"];
        quote: OrderQuote;
        collectionMode: Order["collectionMode"];
        expiresAt: Date | null;
        item: { tenantCourseId: string; courseId: string; courseTitle: string };
        notes?: string | null;
        status?: Order["status"];
        createdAt?: Date;
      }): Promise<Order> {
        return db.transaction(async (tx) => {
          const [order] = await tx
            .insert(orders)
            .values({
              tenantId,
              number: data.number,
              buyerUserId: data.buyerUserId,
              companyId: data.companyId,
              type: data.type,
              status: data.status ?? "pending",
              pricingTier: data.tier,
              subtotalCents: data.quote.subtotalCents,
              totalCents: data.quote.totalCents,
              platformFeeCents: data.quote.platformFeeCents,
              collectionMode: data.collectionMode,
              expiresAt: data.expiresAt,
              notes: data.notes ?? null,
              ...(data.createdAt ? { createdAt: data.createdAt, updatedAt: data.createdAt } : {}),
            })
            .returning();
          await tx.insert(orderItems).values({
            orderId: order.id,
            tenantCourseId: data.item.tenantCourseId,
            courseId: data.item.courseId,
            courseTitle: data.item.courseTitle,
            quantity: data.quote.quantity,
            unitPriceCents: data.quote.unitPriceCents,
            totalCents: data.quote.totalCents,
          });
          return order;
        });
      },

      async findById(id: string): Promise<Order | null> {
        const [row] = await db.select().from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));
        return row ?? null;
      },

      async items(orderId: string): Promise<OrderItem[]> {
        const [own] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
        if (!own) return [];
        return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      },

      /** Mis compras. */
      listForBuyer(buyerUserId: string) {
        return db
          .select({
            id: orders.id,
            number: orders.number,
            type: orders.type,
            status: orders.status,
            totalCents: orders.totalCents,
            createdAt: orders.createdAt,
            courseTitle: orderItems.courseTitle,
            quantity: orderItems.quantity,
            courseId: orderItems.courseId,
            paymentProvider: orders.paymentProvider,
          })
          .from(orders)
          .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
          .where(and(eq(orders.tenantId, tenantId), eq(orders.buyerUserId, buyerUserId)))
          .orderBy(desc(orders.createdAt));
      },

      /** Listado del panel: con comprador, empresa y curso. */
      listForAdmin(filters: OrderAdminFilters = {}) {
        const search = filters.q?.trim();
        const like = search ? `%${escapeLike(search)}%` : null;
        const conditions: (SQL | undefined)[] = [
          eq(orders.tenantId, tenantId),
          filters.status ? eq(orders.status, filters.status) : undefined,
          filters.pendingTransfers
            ? and(eq(orders.status, "awaiting_payment"), eq(orders.paymentProvider, "manual"))
            : undefined,
          filters.from ? gte(orders.createdAt, filters.from) : undefined,
          filters.to ? lt(orders.createdAt, filters.to) : undefined,
          like
            ? or(
                ilike(orders.number, like),
                ilike(users.email, like),
                ilike(users.name, like),
                ilike(companies.legalName, like),
                ilike(orderItems.courseTitle, like),
              )
            : undefined,
        ];
        return db
          .select({
            id: orders.id,
            number: orders.number,
            type: orders.type,
            status: orders.status,
            tier: orders.pricingTier,
            totalCents: orders.totalCents,
            platformFeeCents: orders.platformFeeCents,
            paymentProvider: orders.paymentProvider,
            createdAt: orders.createdAt,
            paidAt: orders.paidAt,
            expiresAt: orders.expiresAt,
            buyerEmail: users.email,
            buyerName: users.name,
            companyName: companies.legalName,
            courseTitle: orderItems.courseTitle,
            quantity: orderItems.quantity,
          })
          .from(orders)
          .innerJoin(users, eq(users.id, orders.buyerUserId))
          .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
          .leftJoin(companies, eq(companies.id, orders.companyId))
          .where(and(...conditions))
          .orderBy(desc(orders.createdAt))
          .limit(500);
      },

      async countPendingTransfers(): Promise<number> {
        const rows = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "awaiting_payment"), eq(orders.paymentProvider, "manual")));
        return rows.length;
      },

      /** `pending`/`failed` → elige proveedor. Devuelve `null` si la orden ya no admite pagar. */
      async startPayment(
        id: string,
        data: { provider: Order["paymentProvider"]; status: "pending" | "awaiting_payment"; expiresAt: Date | null },
      ): Promise<Order | null> {
        const [row] = await db
          .update(orders)
          .set({ paymentProvider: data.provider, status: data.status, expiresAt: data.expiresAt, updatedAt: new Date() })
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id), inArray(orders.status, ["pending", "failed"])))
          .returning();
        return row ?? null;
      },

      /**
       * Pasa a `paid` y cumple la orden en UNA transacción, con la fila de la
       * orden bloqueada. Si ya estaba pagada y cumplida no hace nada
       * (`newlyPaid: false`); si estaba pagada sin cumplir (falló una vez a
       * mitad de camino) la cumple ahora.
       */
      async markPaidAndFulfill(id: string): Promise<{ order: Order; newlyPaid: boolean } | null> {
        return db.transaction(async (tx) => {
          const [locked] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
            .for("update");
          if (!locked) return null;

          if (locked.status === "paid") {
            if (!locked.fulfilledAt) await fulfill(tx, locked);
            const [fresh] = await tx.select().from(orders).where(eq(orders.id, id));
            return { order: fresh, newlyPaid: false };
          }
          if (!(PAYABLE_FROM as readonly string[]).includes(locked.status)) return null;

          const [paid] = await tx
            .update(orders)
            .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
            .where(eq(orders.id, id))
            .returning();
          await fulfill(tx, paid);
          const [fresh] = await tx.select().from(orders).where(eq(orders.id, id));
          return { order: fresh, newlyPaid: true };
        });
      },

      /** `pending`/`awaiting_payment` → `failed` (se puede reintentar). */
      async markFailed(id: string): Promise<Order | null> {
        const [row] = await db
          .update(orders)
          .set({ status: "failed", updatedAt: new Date() })
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id), inArray(orders.status, [...OPEN_STATUSES])))
          .returning();
        return row ?? null;
      },

      async cancel(id: string): Promise<Order | null> {
        const [row] = await db
          .update(orders)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(eq(orders.tenantId, tenantId), eq(orders.id, id), inArray(orders.status, [...OPEN_STATUSES, "failed"])),
          )
          .returning();
        return row ?? null;
      },
    },

    payments: {
      async create(data: {
        orderId: string;
        provider: Payment["provider"];
        status: Payment["status"];
        amountCents: number;
        feeCents?: number;
        externalId?: string | null;
        checkoutUrl?: string | null;
        preferenceId?: string | null;
        raw?: unknown;
      }): Promise<Payment> {
        const [row] = await db
          .insert(payments)
          .values({
            tenantId,
            orderId: data.orderId,
            provider: data.provider,
            status: data.status,
            amountCents: data.amountCents,
            feeCents: data.feeCents ?? 0,
            externalId: data.externalId ?? null,
            externalReference: data.orderId,
            checkoutUrl: data.checkoutUrl ?? null,
            preferenceId: data.preferenceId ?? null,
            raw: data.raw ?? null,
          })
          .returning();
        return row;
      },

      async findById(id: string): Promise<Payment | null> {
        const [row] = await db.select().from(payments).where(and(eq(payments.tenantId, tenantId), eq(payments.id, id)));
        return row ?? null;
      },

      async findByExternal(provider: Payment["provider"], externalId: string): Promise<Payment | null> {
        const [row] = await db
          .select()
          .from(payments)
          .where(and(eq(payments.tenantId, tenantId), eq(payments.provider, provider), eq(payments.externalId, externalId)));
        return row ?? null;
      },

      /** El pago vigente (el más reciente) de una orden. */
      async latestForOrder(orderId: string): Promise<Payment | null> {
        const [row] = await db
          .select()
          .from(payments)
          .where(and(eq(payments.tenantId, tenantId), eq(payments.orderId, orderId)))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        return row ?? null;
      },

      async update(
        id: string,
        data: Partial<Pick<Payment, "status" | "feeCents" | "raw" | "markedByUserId" | "manualReference" | "externalId" | "checkoutUrl">>,
      ): Promise<Payment | null> {
        const [row] = await db
          .update(payments)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(payments.tenantId, tenantId), eq(payments.id, id)))
          .returning();
        return row ?? null;
      },

      async recordEvent(data: {
        provider: Payment["provider"];
        topic: string;
        externalId?: string | null;
        payload?: unknown;
        error?: string | null;
      }) {
        await db.insert(paymentEvents).values({
          tenantId,
          provider: data.provider,
          topic: data.topic,
          externalId: data.externalId ?? null,
          payload: data.payload ?? null,
          signatureValid: null,
          processedAt: new Date(),
          error: data.error ?? null,
        });
      },
    },

    seatCodes: {
      /** Los códigos de una orden, con quién los canjeó y cuánto lleva del curso. */
      listForOrder(orderId: string) {
        return db
          .select({
            id: seatCodes.id,
            code: seatCodes.code,
            status: seatCodes.status,
            sentToEmail: seatCodes.sentToEmail,
            sentAt: seatCodes.sentAt,
            redeemedAt: seatCodes.redeemedAt,
            redeemerName: users.name,
            redeemerEmail: users.email,
            progressPct: enrollments.progressPct,
          })
          .from(seatCodes)
          .leftJoin(users, eq(users.id, seatCodes.redeemedByUserId))
          .leftJoin(enrollments, eq(enrollments.seatCodeId, seatCodes.id))
          .where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.orderId, orderId)))
          .orderBy(asc(seatCodes.createdAt), asc(seatCodes.code));
      },

      /** Panel: todos los códigos de la cámara (de órdenes o creados sin orden). */
      listForAdmin(filters: { courseId?: string; status?: SeatCode["status"] } = {}) {
        return db
          .select({
            id: seatCodes.id,
            code: seatCodes.code,
            status: seatCodes.status,
            orderNumber: orders.number,
            companyName: companies.legalName,
            courseTitle: courses.title,
            sentToEmail: seatCodes.sentToEmail,
            redeemerEmail: users.email,
            redeemedAt: seatCodes.redeemedAt,
            createdAt: seatCodes.createdAt,
            progressPct: enrollments.progressPct,
          })
          .from(seatCodes)
          .innerJoin(courses, eq(courses.id, seatCodes.courseId))
          .leftJoin(orders, eq(orders.id, seatCodes.orderId))
          .leftJoin(companies, eq(companies.id, seatCodes.companyId))
          .leftJoin(users, eq(users.id, seatCodes.redeemedByUserId))
          .leftJoin(enrollments, eq(enrollments.seatCodeId, seatCodes.id))
          .where(
            and(
              eq(seatCodes.tenantId, tenantId),
              filters.courseId ? eq(seatCodes.courseId, filters.courseId) : undefined,
              filters.status ? eq(seatCodes.status, filters.status) : undefined,
            ),
          )
          .orderBy(desc(seatCodes.createdAt), asc(seatCodes.code))
          .limit(1000);
      },

      async findByCode(code: string): Promise<SeatCode | null> {
        const [row] = await db.select().from(seatCodes).where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.code, code)));
        return row ?? null;
      },

      async findInOrder(orderId: string, id: string): Promise<SeatCode | null> {
        const [row] = await db
          .select()
          .from(seatCodes)
          .where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.orderId, orderId), eq(seatCodes.id, id)));
        return row ?? null;
      },

      /** Códigos sin orden (el admin los crea para una empresa que pagó por fuera). */
      async createWithoutOrder(data: {
        courseId: string;
        tenantCourseId: string;
        companyId: string | null;
        quantity: number;
        createdByUserId: string;
      }): Promise<SeatCode[]> {
        const created: SeatCode[] = [];
        while (created.length < data.quantity) {
          const rows = await db
            .insert(seatCodes)
            .values(
              generateSeatCodes(data.quantity - created.length).map((code) => ({
                tenantId,
                courseId: data.courseId,
                tenantCourseId: data.tenantCourseId,
                companyId: data.companyId,
                code,
                createdByUserId: data.createdByUserId,
              })),
            )
            .onConflictDoNothing()
            .returning();
          created.push(...rows);
        }
        return created;
      },

      /** `available`/`sent` → `sent` (se puede reenviar a otro email mientras no esté canjeado). */
      async markSent(id: string, email: string): Promise<SeatCode | null> {
        const [row] = await db
          .update(seatCodes)
          .set({ status: "sent", sentToEmail: email, sentAt: new Date() })
          .where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.id, id), inArray(seatCodes.status, ["available", "sent"])))
          .returning();
        return row ?? null;
      },

      async revoke(id: string): Promise<SeatCode | null> {
        const [row] = await db
          .update(seatCodes)
          .set({ status: "revoked" })
          .where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.id, id), inArray(seatCodes.status, ["available", "sent"])))
          .returning();
        return row ?? null;
      },

      /**
       * Canje atómico (`update … where status in ('available','sent')`): un
       * código se canjea una sola vez. Si el usuario ya está inscripto en el
       * curso, el código NO se consume (docs/03).
       */
      async redeem(code: string, userId: string): Promise<RedeemResult> {
        return db.transaction(async (tx): Promise<RedeemResult> => {
          const [seat] = await tx
            .select()
            .from(seatCodes)
            .where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.code, code)))
            .for("update");
          if (!seat) return { ok: false, reason: "not_found" };
          if (seat.status === "revoked") return { ok: false, reason: "revoked" };
          if (seat.status === "redeemed") return { ok: false, reason: "redeemed" };
          if (seat.expiresAt && seat.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

          const [existing] = await tx
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.userId, userId), eq(enrollments.courseId, seat.courseId)));
          const activeEnrollment =
            existing && existing.status !== "revoked" && existing.status !== "expired" &&
            !(existing.expiresAt && existing.expiresAt.getTime() < Date.now());
          if (activeEnrollment) return { ok: false, reason: "already_enrolled" };

          const [tenantCourse] = await tx.select().from(tenantCourses).where(eq(tenantCourses.id, seat.tenantCourseId));
          const expiresAt = tenantCourse?.accessDays ? new Date(Date.now() + tenantCourse.accessDays * 86_400_000) : null;
          const [enrollment] = await tx
            .insert(enrollments)
            .values({
              tenantId,
              userId,
              courseId: seat.courseId,
              tenantCourseId: seat.tenantCourseId,
              source: "seat_code",
              seatCodeId: seat.id,
              expiresAt,
            })
            .onConflictDoUpdate({
              target: [enrollments.tenantId, enrollments.userId, enrollments.courseId],
              set: { status: "active", source: "seat_code", seatCodeId: seat.id, expiresAt, enrolledAt: new Date() },
              setWhere: inArray(enrollments.status, ["revoked", "expired"]),
            })
            .returning({ id: enrollments.id });

          const [redeemed] = await tx
            .update(seatCodes)
            .set({ status: "redeemed", redeemedByUserId: userId, redeemedAt: new Date() })
            .where(and(eq(seatCodes.id, seat.id), inArray(seatCodes.status, ["available", "sent"])))
            .returning({ id: seatCodes.id });
          if (!redeemed) return { ok: false, reason: "redeemed" };

          // Su empresa queda asociada a la de quien compró (si todavía no tenía una).
          if (seat.companyId) {
            await tx
              .update(tenantMemberships)
              .set({ companyId: seat.companyId })
              .where(
                and(
                  eq(tenantMemberships.tenantId, tenantId),
                  eq(tenantMemberships.userId, userId),
                  isNull(tenantMemberships.companyId),
                ),
              );
          }
          return { ok: true, courseId: seat.courseId, tenantCourseId: seat.tenantCourseId, enrollmentId: enrollment.id };
        });
      },

      /** Resumen "N compradas, M enviadas, K canjeadas" de una orden. */
      async summaryForOrder(orderId: string) {
        const rows = await db
          .select({ status: seatCodes.status })
          .from(seatCodes)
          .where(and(eq(seatCodes.tenantId, tenantId), eq(seatCodes.orderId, orderId)));
        return {
          total: rows.length,
          sent: rows.filter((r) => r.status === "sent").length,
          redeemed: rows.filter((r) => r.status === "redeemed").length,
        };
      },
    },
  };
}

/**
 * Cron `expire-orders`: GLOBAL a propósito (recorre todas las cámaras, como la
 * verificación de certificados). `pending`/`awaiting_payment` con `expires_at`
 * vencido → `expired`. Condicional: no toca nada que ya se haya pagado.
 */
export async function expireStaleOrders(
  now: Date = new Date(),
  /** Solo para tests: limita el barrido a estas órdenes. */
  only?: string[],
): Promise<{ id: string; tenantId: string }[]> {
  return db
    .update(orders)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        inArray(orders.status, [...OPEN_STATUSES]),
        lt(orders.expiresAt, now),
        only ? inArray(orders.id, only) : undefined,
      ),
    )
    .returning({ id: orders.id, tenantId: orders.tenantId });
}
