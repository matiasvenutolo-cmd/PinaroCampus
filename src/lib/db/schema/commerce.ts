import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { companies } from "./companies";
import { courses } from "./courses";
import { tenantCourses } from "./enrollments";
import {
  collectionMode,
  orderStatus,
  orderType,
  paymentProviderEnum,
  paymentStatus,
  pricingTier,
  seatCodeStatus,
} from "./enums";
import { tenants } from "./tenants";

// Todo lo comercial (docs/03, "Comercial") lleva `tenant_id` y se consulta
// solo a través de `forTenant()`. La plata va en centavos enteros (regla 3).

/** Contador por cámara para el número legible de las órdenes (`CIVA-000123`). */
export const orderCounters = pgTable("order_counters", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull().default(0),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    type: orderType("type").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    pricingTier: pricingTier("pricing_tier").notNull(),
    currency: text("currency").notNull().default("ARS"),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    platformFeeCents: bigint("platform_fee_cents", { mode: "number" }).notNull().default(0),
    collectionMode: collectionMode("collection_mode").notNull(),
    paymentProvider: paymentProviderEnum("payment_provider"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Se setea en la misma transacción que el paso a `paid`: la inscripción o los códigos ya existen. */
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.tenantId, table.number),
    index("orders_tenant_status_created_idx").on(table.tenantId, table.status, table.createdAt),
    index("orders_tenant_buyer_idx").on(table.tenantId, table.buyerUserId),
    index("orders_company_id_idx").on(table.companyId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tenantCourseId: uuid("tenant_course_id")
      .notNull()
      .references(() => tenantCourses.id, { onDelete: "restrict" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    /** Snapshot: si el curso cambia de título, la compra no. */
    courseTitle: text("course_title").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
  },
  (table) => [index("order_items_order_id_idx").on(table.orderId), index("order_items_course_id_idx").on(table.courseId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull(),
    externalId: text("external_id"),
    /** = `order.id`: lo que se manda al proveedor para reconocer la orden. */
    externalReference: text("external_reference").notNull(),
    preferenceId: text("preference_id"),
    status: paymentStatus("status").notNull().default("created"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    feeCents: bigint("fee_cents", { mode: "number" }).notNull().default(0),
    checkoutUrl: text("checkout_url"),
    markedByUserId: uuid("marked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    manualReference: text("manual_reference"),
    raw: jsonb("raw").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.provider, table.externalId),
    index("payments_order_id_idx").on(table.orderId),
    index("payments_tenant_id_idx").on(table.tenantId),
  ],
);

/** Log crudo de eventos de pago (webhooks y decisiones del pago simulado). */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    provider: paymentProviderEnum("provider").notNull(),
    topic: text("topic").notNull(),
    externalId: text("external_id"),
    payload: jsonb("payload").$type<unknown>(),
    headers: jsonb("headers").$type<Record<string, string>>(),
    signatureValid: boolean("signature_valid"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payment_events_tenant_id_idx").on(table.tenantId)],
);

export const seatCodes = pgTable(
  "seat_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    tenantCourseId: uuid("tenant_course_id")
      .notNull()
      .references(() => tenantCourses.id, { onDelete: "restrict" }),
    /** `null` = creado por un admin sin orden. */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    code: text("code").notNull().unique(),
    status: seatCodeStatus("status").notNull().default("available"),
    sentToEmail: text("sent_to_email"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    redeemedByUserId: uuid("redeemed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("seat_codes_order_id_idx").on(table.orderId),
    index("seat_codes_tenant_status_idx").on(table.tenantId, table.status),
    index("seat_codes_company_id_idx").on(table.companyId),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orders.tenantId], references: [tenants.id] }),
  buyer: one(users, { fields: [orders.buyerUserId], references: [users.id] }),
  company: one(companies, { fields: [orders.companyId], references: [companies.id] }),
  items: many(orderItems),
  payments: many(payments),
  seatCodes: many(seatCodes),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const seatCodesRelations = relations(seatCodes, ({ one }) => ({
  order: one(orders, { fields: [seatCodes.orderId], references: [orders.id] }),
}));
