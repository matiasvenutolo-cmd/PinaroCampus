// Sin `server-only`: a propósito, para que scripts/seed.ts pueda reusar estos
// helpers fuera del bundler de Next (donde ese guard siempre tira error).
import { and, eq } from "drizzle-orm";

import { db } from "./index";
import { auditLog, categories, companies, tenantMemberships } from "./schema";

export type TenantId = string;

/**
 * Único punto permitido para consultar tablas 🔒 (con `tenant_id`) fuera de
 * `src/lib/db/`. El `tenantId` sale siempre del tenant resuelto por host
 * (nunca de un parámetro que mande el cliente) — ver CLAUDE.md regla 1 y
 * `src/lib/tenant/resolve.ts`. `tests/isolation/` prueba que ningún método
 * de acá devuelve filas de otro tenant.
 *
 * Se agregan más tablas y métodos a medida que las fases los necesitan
 * (enrollments, orders, ... llegan en Fases 2 y 4).
 */
export function forTenant(tenantId: TenantId) {
  return {
    tenantId,

    companies: {
      list() {
        return db.select().from(companies).where(eq(companies.tenantId, tenantId));
      },
      findByCuit(cuit: string) {
        return db
          .select()
          .from(companies)
          .where(and(eq(companies.tenantId, tenantId), eq(companies.cuit, cuit)))
          .then((rows) => rows[0] ?? null);
      },
      create(data: Omit<typeof companies.$inferInsert, "tenantId">) {
        return db
          .insert(companies)
          .values({ ...data, tenantId })
          .returning()
          .then((rows) => rows[0]);
      },
    },

    categories: {
      list() {
        return db
          .select()
          .from(categories)
          .where(eq(categories.tenantId, tenantId))
          .orderBy(categories.sortOrder);
      },
    },

    memberships: {
      findByUserId(userId: string) {
        return db
          .select()
          .from(tenantMemberships)
          .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
          .then((rows) => rows[0] ?? null);
      },
      create(data: Omit<typeof tenantMemberships.$inferInsert, "tenantId">) {
        return db
          .insert(tenantMemberships)
          .values({ ...data, tenantId })
          .returning()
          .then((rows) => rows[0]);
      },
      update(membershipId: string, data: Partial<typeof tenantMemberships.$inferInsert>) {
        return db
          .update(tenantMemberships)
          .set(data)
          .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.id, membershipId)))
          .returning()
          .then((rows) => rows[0] ?? null);
      },
    },

    auditLog: {
      record(entry: Omit<typeof auditLog.$inferInsert, "tenantId">) {
        return db.insert(auditLog).values({ ...entry, tenantId });
      },
    },
  };
}

/** Para acciones globales de superadmin (`tenant_id` null en audit_log). */
export function recordGlobalAudit(entry: Omit<typeof auditLog.$inferInsert, "tenantId">) {
  return db.insert(auditLog).values({ ...entry, tenantId: null });
}
