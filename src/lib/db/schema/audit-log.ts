import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { tenants } from "./tenants";

// `tenantId` null = acción global de superadmin (docs/03-modelo-de-datos.md).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_tenant_id_idx").on(table.tenantId),
    index("audit_log_actor_user_id_idx").on(table.actorUserId),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLog.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [auditLog.actorUserId], references: [users.id] }),
}));
