import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenants";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.tenantId, table.slug)],
);

export const categoriesRelations = relations(categories, ({ one }) => ({
  tenant: one(tenants, { fields: [categories.tenantId], references: [tenants.id] }),
}));
