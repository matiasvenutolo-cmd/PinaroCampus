import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  defaultTenantCertificateConfig,
  defaultTenantHomeContent,
  defaultTenantTheme,
  type TenantCertificateConfig,
  type TenantHomeContent,
  type TenantTheme,
} from "@/lib/tenant/types";

import { collectionMode, memberValidationMode, tenantStatus } from "./enums";

export type PaymentMethod = "mercadopago" | "manual" | "mock";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  campusName: text("campus_name").notNull(),
  status: tenantStatus("status").notNull().default("active"),
  isDemo: boolean("is_demo").notNull().default(false),
  contactEmail: text("contact_email").notNull(),
  websiteUrl: text("website_url"),
  logoUrl: text("logo_url"),
  logoOnDarkUrl: text("logo_on_dark_url"),
  faviconUrl: text("favicon_url"),
  theme: jsonb("theme").$type<TenantTheme>().notNull().default(defaultTenantTheme),
  homeContent: jsonb("home_content")
    .$type<TenantHomeContent>()
    .notNull()
    .default(defaultTenantHomeContent),
  certificateConfig: jsonb("certificate_config")
    .$type<TenantCertificateConfig>()
    .notNull()
    .default(defaultTenantCertificateConfig),
  memberValidationMode: memberValidationMode("member_validation_mode").notNull().default("open"),
  collectionMode: collectionMode("collection_mode").notNull().default("platform_account"),
  platformFeeBps: integer("platform_fee_bps").notNull().default(0),
  paymentMethods: text("payment_methods")
    .array()
    .$type<PaymentMethod[]>()
    .notNull()
    .default([]),
  manualPaymentInstructions: text("manual_payment_instructions"),
  manualPaymentExpiryDays: integer("manual_payment_expiry_days").notNull().default(7),
  seatPackMax: integer("seat_pack_max").notNull().default(200),
  legalPrivacyMd: text("legal_privacy_md"),
  legalTermsMd: text("legal_terms_md"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tenant_domains_tenant_id_idx").on(table.tenantId)],
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  domains: many(tenantDomains),
}));

export const tenantDomainsRelations = relations(tenantDomains, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantDomains.tenantId],
    references: [tenants.id],
  }),
}));
