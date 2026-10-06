import { integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.key, table.windowStart)],
);
