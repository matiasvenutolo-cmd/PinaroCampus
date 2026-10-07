import { relations, sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { courses } from "./courses";
import { enrollments } from "./enrollments";
import { tenants } from "./tenants";

/** Lo que el certificado muestra y no puede cambiar después (CLAUDE.md regla 8). */
export interface CertificateSnapshot {
  tenantName: string;
  tenantShortName: string;
  logoUrl: string | null;
  primaryColor: string;
  title: string;
  /** `false` si el curso no tiene examen final: el certificado no muestra nota. */
  graded: boolean;
  signatories: { name: string; role: string; signatureUrl: string | null }[];
  footerText: string | null;
  showDni: boolean;
}

// 🔒 tenant_id. Solo se consulta con `forTenant()`, salvo la verificación
// pública por código (`lookupCertificateByCode`), que es global a propósito
// (docs/06: "la búsqueda por código es global").
export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    holderName: text("holder_name").notNull(),
    holderDni: text("holder_dni"),
    courseTitle: text("course_title").notNull(),
    hours: numeric("hours", { precision: 5, scale: 1 }).notNull(),
    score: integer("score").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
    /** Certificado al que reemplaza (reemisión): queda el rastro completo. */
    replacesCertificateId: uuid("replaces_certificate_id"),
    pdfUrl: text("pdf_url"),
    snapshot: jsonb("snapshot").$type<CertificateSnapshot>().notNull(),
  },
  (table) => [
    // Una sola vigente por inscripción: la emisión es idempotente, y un
    // certificado revocado deja lugar para el reemitido (docs/06).
    uniqueIndex("certificates_enrollment_active_idx").on(table.enrollmentId).where(sql`${table.revokedAt} is null`),
    index("certificates_tenant_issued_idx").on(table.tenantId, table.issuedAt),
    index("certificates_user_id_idx").on(table.userId),
    index("certificates_course_id_idx").on(table.courseId),
  ],
);

export const certificatesRelations = relations(certificates, ({ one }) => ({
  tenant: one(tenants, { fields: [certificates.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [certificates.userId], references: [users.id] }),
  course: one(courses, { fields: [certificates.courseId], references: [courses.id] }),
  enrollment: one(enrollments, { fields: [certificates.enrollmentId], references: [enrollments.id] }),
}));
