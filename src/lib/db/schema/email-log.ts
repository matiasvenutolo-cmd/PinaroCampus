import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenants";

export const emailChannel = pgEnum("email_channel", ["resend", "console"]);

// docs/09-demo-y-seed.md: los emails a dominios .demo (o sin RESEND_API_KEY)
// se loguean acá en vez de enviarse, y el superadmin ve los últimos 50.
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    channel: emailChannel("channel").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_log_created_at_idx").on(table.createdAt)],
);
