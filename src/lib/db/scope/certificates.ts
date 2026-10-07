// Certificados 🔒 (tenant_id). Solo se usan a través de `forTenant()`, salvo
// `lookupCertificateByCode`: la verificación pública busca por código en todas
// las cámaras (docs/06) y el PDF decide el permiso con el dueño del certificado.
import { and, desc, eq, gte, ilike, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";

import { db } from "../index";
import { certificates, companies, courses, enrollments, tenantMemberships, tenants, users } from "../schema";

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = Omit<typeof certificates.$inferInsert, "tenantId">;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface CertificateAdminFilters {
  q?: string;
  courseId?: string;
  status?: "active" | "revoked";
  from?: Date;
  /** Exclusivo: primer instante que ya no entra. */
  to?: Date;
}

export function certificateScope(tenantId: string) {
  return {
    certificates: {
      async findById(id: string): Promise<Certificate | null> {
        const [row] = await db
          .select()
          .from(certificates)
          .where(and(eq(certificates.tenantId, tenantId), eq(certificates.id, id)));
        return row ?? null;
      },

      async findByCode(code: string): Promise<Certificate | null> {
        const [row] = await db
          .select()
          .from(certificates)
          .where(and(eq(certificates.tenantId, tenantId), eq(certificates.code, code)));
        return row ?? null;
      },

      /** Cualquier certificado (vigente o revocado) de la inscripción: el más reciente. */
      async latestForEnrollment(enrollmentId: string): Promise<Certificate | null> {
        const [row] = await db
          .select()
          .from(certificates)
          .where(and(eq(certificates.tenantId, tenantId), eq(certificates.enrollmentId, enrollmentId)))
          .orderBy(desc(certificates.issuedAt))
          .limit(1);
        return row ?? null;
      },

      /** Vigente de la inscripción, si lo hay. */
      async activeForEnrollment(enrollmentId: string): Promise<Certificate | null> {
        const [row] = await db
          .select()
          .from(certificates)
          .where(
            and(
              eq(certificates.tenantId, tenantId),
              eq(certificates.enrollmentId, enrollmentId),
              isNull(certificates.revokedAt),
            ),
          );
        return row ?? null;
      },

      /**
       * Idempotente: si ya hay uno vigente para la inscripción (índice único
       * parcial) devuelve `null` sin escribir. También devuelve `null` ante
       * una colisión de código; el llamador distingue las dos releyendo.
       */
      async insert(data: NewCertificate): Promise<Certificate | null> {
        const [row] = await db
          .insert(certificates)
          .values({ ...data, tenantId })
          .onConflictDoNothing()
          .returning();
        return row ?? null;
      },

      async revoke(id: string, reason: string): Promise<Certificate | null> {
        const [row] = await db
          .update(certificates)
          .set({ revokedAt: new Date(), revokedReason: reason, pdfUrl: null })
          .where(and(eq(certificates.tenantId, tenantId), eq(certificates.id, id), isNull(certificates.revokedAt)))
          .returning();
        return row ?? null;
      },

      /** Los del alumno, con el slug del curso para armar links. */
      listForUser(userId: string) {
        return db
          .select({
            id: certificates.id,
            code: certificates.code,
            courseTitle: certificates.courseTitle,
            courseSlug: courses.slug,
            hours: certificates.hours,
            score: certificates.score,
            holderName: certificates.holderName,
            issuedAt: certificates.issuedAt,
            revokedAt: certificates.revokedAt,
            title: certificates.snapshot,
          })
          .from(certificates)
          .innerJoin(courses, eq(courses.id, certificates.courseId))
          .where(and(eq(certificates.tenantId, tenantId), eq(certificates.userId, userId)))
          .orderBy(desc(certificates.issuedAt));
      },

      /** Certificados vigentes de un alumno por curso (para los botones de "Mi campus"). */
      async activeCodesForUser(userId: string): Promise<Map<string, string>> {
        const rows = await db
          .select({ courseId: certificates.courseId, code: certificates.code })
          .from(certificates)
          .where(and(eq(certificates.tenantId, tenantId), eq(certificates.userId, userId), isNull(certificates.revokedAt)));
        return new Map(rows.map((r) => [r.courseId, r.code]));
      },

      /** Listado del panel: con alumno, empresa y curso; búsqueda y filtros. */
      listForAdmin(filters: CertificateAdminFilters = {}) {
        const search = filters.q?.trim();
        const like = search ? `%${escapeLike(search)}%` : null;
        const conditions: (SQL | undefined)[] = [
          eq(certificates.tenantId, tenantId),
          filters.courseId ? eq(certificates.courseId, filters.courseId) : undefined,
          filters.status === "active" ? isNull(certificates.revokedAt) : undefined,
          filters.status === "revoked" ? isNotNull(certificates.revokedAt) : undefined,
          filters.from ? gte(certificates.issuedAt, filters.from) : undefined,
          filters.to ? lt(certificates.issuedAt, filters.to) : undefined,
          like
            ? or(
                ilike(certificates.holderName, like),
                ilike(certificates.holderDni, like),
                ilike(certificates.courseTitle, like),
                ilike(certificates.code, like),
                ilike(companies.legalName, like),
                ilike(users.email, like),
              )
            : undefined,
        ];
        return db
          .select({
            id: certificates.id,
            code: certificates.code,
            holderName: certificates.holderName,
            holderDni: certificates.holderDni,
            email: users.email,
            companyName: companies.legalName,
            courseId: certificates.courseId,
            courseTitle: certificates.courseTitle,
            hours: certificates.hours,
            score: certificates.score,
            issuedAt: certificates.issuedAt,
            revokedAt: certificates.revokedAt,
            revokedReason: certificates.revokedReason,
            replacesCertificateId: certificates.replacesCertificateId,
            enrollmentId: certificates.enrollmentId,
          })
          .from(certificates)
          .innerJoin(users, eq(users.id, certificates.userId))
          .leftJoin(
            tenantMemberships,
            and(eq(tenantMemberships.tenantId, certificates.tenantId), eq(tenantMemberships.userId, certificates.userId)),
          )
          .leftJoin(companies, eq(companies.id, tenantMemberships.companyId))
          .where(and(...conditions))
          .orderBy(desc(certificates.issuedAt))
          .limit(1000);
      },

      /** Cursos que tienen al menos un certificado en la cámara (opciones del filtro). */
      distinctCourses() {
        return db
          .selectDistinct({ id: certificates.courseId, title: certificates.courseTitle })
          .from(certificates)
          .where(eq(certificates.tenantId, tenantId))
          .orderBy(certificates.courseTitle);
      },

      /** Cantidad de certificados vigentes (KPI del panel). */
      async countActive(): Promise<number> {
        const rows = await db
          .select({ id: certificates.id })
          .from(certificates)
          .where(and(eq(certificates.tenantId, tenantId), isNull(certificates.revokedAt)));
        return rows.length;
      },
    },

    /** La inscripción como la ve el servicio de emisión (verificada contra el tenant). */
    enrollmentCompletion: {
      async markCompleted(enrollmentId: string, at: Date = new Date()) {
        await db
          .update(enrollments)
          .set({ status: "completed", completedAt: at })
          .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.id, enrollmentId), eq(enrollments.status, "active")));
      },
    },
  };
}

/**
 * Búsqueda GLOBAL por código (verificación pública y PDF). Devuelve el
 * certificado completo y la cámara emisora; quien llama decide qué mostrar o
 * si el usuario tiene permiso.
 */
export async function lookupCertificateByCode(code: string) {
  const [row] = await db
    .select({ certificate: certificates, tenant: tenants })
    .from(certificates)
    .innerJoin(tenants, eq(tenants.id, certificates.tenantId))
    .where(eq(certificates.code, code));
  return row ?? null;
}
