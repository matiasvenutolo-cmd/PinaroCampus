import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { companies } from "./companies";
import { memberStatus, membershipRole } from "./enums";
import { tenants } from "./tenants";

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull().default("student"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    jobTitle: text("job_title"),
    memberStatus: memberStatus("member_status").notNull().default("none"),
    memberReviewedBy: uuid("member_reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    memberReviewedAt: timestamp("member_reviewed_at", { withTimezone: true }),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.tenantId, table.userId),
    index("tenant_memberships_tenant_company_idx").on(table.tenantId, table.companyId),
    index("tenant_memberships_reviewed_by_idx").on(table.memberReviewedBy),
  ],
);

export const tenantMembershipsRelations = relations(tenantMemberships, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantMemberships.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [tenantMemberships.userId], references: [users.id] }),
  company: one(companies, {
    fields: [tenantMemberships.companyId],
    references: [companies.id],
  }),
}));
