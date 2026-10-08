// Sin `server-only`: a propósito, para que scripts/seed.ts pueda reusar estos
// helpers fuera del bundler de Next (donde ese guard siempre tira error).
import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "./index";
import { assessmentScope } from "./scope/assessments";
import { certificateScope } from "./scope/certificates";
import { orderScope } from "./scope/orders";
import { courseScope } from "./scope/courses";
import { auditLog, categories, companies, enrollments, tenantMemberships, users } from "./schema";

export type TenantId = string;

/**
 * Único punto permitido para consultar tablas 🔒 (con `tenant_id`) fuera de
 * `src/lib/db/`. El `tenantId` sale siempre del tenant resuelto por host
 * (nunca de un parámetro que mande el cliente) — ver CLAUDE.md regla 1 y
 * `src/lib/tenant/resolve.ts`. `tests/isolation/` prueba que ningún método
 * de acá devuelve filas de otro tenant.
 *
 * Se agregan más tablas y métodos a medida que las fases los necesitan
 * (orders, seat_codes, ... llegan en la Fase 4). Catálogo, inscripciones,
 * progreso y lista de espera viven en `scope/courses.ts` y se exponen acá.
 */
export function forTenant(tenantId: TenantId) {
  return {
    tenantId,
    ...courseScope(tenantId),
    ...assessmentScope(tenantId),
    ...certificateScope(tenantId),
    ...orderScope(tenantId),

    companies: {
      list() {
        return db.select().from(companies).where(eq(companies.tenantId, tenantId));
      },
      findById(id: string) {
        return db
          .select()
          .from(companies)
          .where(and(eq(companies.tenantId, tenantId), eq(companies.id, id)))
          .then((rows) => rows[0] ?? null);
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
      update(id: string, data: Partial<Omit<typeof companies.$inferInsert, "tenantId" | "id">>) {
        return db
          .update(companies)
          .set(data)
          .where(and(eq(companies.tenantId, tenantId), eq(companies.id, id)))
          .returning()
          .then((rows) => rows[0] ?? null);
      },
      /** Marca una empresa como socia (al aprobar a alguien de ella). */
      async markMember(id: string) {
        await db
          .update(companies)
          .set({ isMember: true, memberSince: sql`coalesce(${companies.memberSince}, current_date)` })
          .where(and(eq(companies.tenantId, tenantId), eq(companies.id, id)));
      },
      /** Padrón con cuántas personas y cuántas inscripciones tiene cada empresa; búsqueda por razón social, fantasía o CUIT. */
      listWithStats(q?: string) {
        const search = q?.trim();
        const like = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
        return db
          .select({
            id: companies.id,
            cuit: companies.cuit,
            legalName: companies.legalName,
            tradeName: companies.tradeName,
            isMember: companies.isMember,
            memberSince: companies.memberSince,
            emailDomains: companies.emailDomains,
            source: companies.source,
            people: sql<number>`(select count(*)::int from ${tenantMemberships} tm where tm.company_id = "companies"."id" and tm.tenant_id = ${tenantId})`,
            enrolled: sql<number>`(select count(*)::int from ${enrollments} e join ${tenantMemberships} tm on tm.user_id = e.user_id and tm.tenant_id = e.tenant_id where tm.company_id = "companies"."id" and e.tenant_id = ${tenantId})`,
          })
          .from(companies)
          .where(
            and(
              eq(companies.tenantId, tenantId),
              like
                ? or(ilike(companies.legalName, like), ilike(companies.tradeName, like), ilike(companies.cuit, like))
                : undefined,
            ),
          )
          .orderBy(asc(companies.legalName));
      },
      /**
       * Importación del padrón (CSV): crea las empresas nuevas y actualiza las
       * que ya existen por CUIT. Devuelve cuántas de cada una.
       */
      async importRoster(
        rows: {
          cuit: string;
          legalName: string;
          tradeName: string | null;
          isMember: boolean;
          emailDomains: string[];
        }[],
      ) {
        const existing = new Set(
          (await db.select({ cuit: companies.cuit }).from(companies).where(eq(companies.tenantId, tenantId))).map(
            (r) => r.cuit,
          ),
        );
        let created = 0;
        let updated = 0;
        for (const row of rows) {
          await db
            .insert(companies)
            .values({
              tenantId,
              cuit: row.cuit,
              legalName: row.legalName,
              tradeName: row.tradeName,
              isMember: row.isMember,
              memberSince: row.isMember ? sql`current_date` : null,
              emailDomains: row.emailDomains,
              source: "roster",
            })
            .onConflictDoUpdate({
              target: [companies.tenantId, companies.cuit],
              set: {
                legalName: row.legalName,
                tradeName: row.tradeName,
                isMember: row.isMember,
                memberSince: row.isMember ? sql`coalesce(${companies.memberSince}, current_date)` : sql`null`,
                emailDomains: row.emailDomains,
                source: "roster",
              },
            });
          if (existing.has(row.cuit)) updated++;
          else {
            created++;
            existing.add(row.cuit);
          }
        }
        return { created, updated };
      },
    },

    categories: {
      findBySlug(slug: string) {
        return db
          .select()
          .from(categories)
          .where(and(eq(categories.tenantId, tenantId), eq(categories.slug, slug)))
          .then((rows) => rows[0] ?? null);
      },
      list() {
        return db
          .select()
          .from(categories)
          .where(eq(categories.tenantId, tenantId))
          .orderBy(categories.sortOrder);
      },
    },

    memberships: {
      /** Alumno de ESTA cámara por email (para inscribirlo a mano). */
      findByEmail(email: string) {
        return db
          .select({ membership: tenantMemberships, user: users })
          .from(tenantMemberships)
          .innerJoin(users, eq(users.id, tenantMemberships.userId))
          .where(and(eq(tenantMemberships.tenantId, tenantId), eq(users.email, email.toLowerCase())))
          .then((rows) => rows[0] ?? null);
      },
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
      /** Pedido de socio pendiente de aprobación. */
      findPendingById(membershipId: string) {
        return db
          .select()
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.tenantId, tenantId),
              eq(tenantMemberships.id, membershipId),
              eq(tenantMemberships.memberStatus, "pending"),
            ),
          )
          .then((rows) => rows[0] ?? null);
      },
      listPending() {
        return db
          .select({
            membershipId: tenantMemberships.id,
            email: users.email,
            name: users.name,
            jobTitle: tenantMemberships.jobTitle,
            companyName: companies.legalName,
            companyCuit: companies.cuit,
            companyIsMember: companies.isMember,
            requestedAt: tenantMemberships.createdAt,
          })
          .from(tenantMemberships)
          .innerJoin(users, eq(users.id, tenantMemberships.userId))
          .leftJoin(companies, eq(companies.id, tenantMemberships.companyId))
          .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.memberStatus, "pending")))
          .orderBy(asc(tenantMemberships.createdAt));
      },
      countPending() {
        return db
          .select({ total: count() })
          .from(tenantMemberships)
          .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.memberStatus, "pending")))
          .then((rows) => rows[0]?.total ?? 0);
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
