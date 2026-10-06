import { relations } from "drizzle-orm";
import { boolean, date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { companySource } from "./enums";
import { tenants } from "./tenants";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    cuit: text("cuit").notNull(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    isMember: boolean("is_member").notNull().default(false),
    memberSince: date("member_since"),
    emailDomains: text("email_domains").array().notNull().default([]),
    source: companySource("source").notNull().default("self_declared"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.tenantId, table.cuit)],
);

export const companiesRelations = relations(companies, ({ one }) => ({
  tenant: one(tenants, { fields: [companies.tenantId], references: [tenants.id] }),
}));
