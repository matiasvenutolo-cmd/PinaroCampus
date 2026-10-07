import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { assessments } from "./courses";
import { enrollments } from "./enrollments";

/**
 * Un intento de quiz o de examen. El sorteo de preguntas y el orden de las
 * opciones se guardan al empezar (docs/03): así recargar la página retoma el
 * mismo intento y la corrección se hace contra lo que el alumno vio.
 * Se accede solo a través de `forTenant()` (la propiedad del intento se
 * verifica por la inscripción, que sí tiene `tenant_id`).
 */
export const assessmentAttempts = pgTable(
  "assessment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    /** Ids de las preguntas sorteadas, en el orden mostrado. */
    questionIds: jsonb("question_ids").$type<string[]>().notNull(),
    /** Orden de las opciones mostrado por pregunta (`true_false` no tiene). */
    optionOrders: jsonb("option_orders").$type<Record<string, string[]>>().notNull().default({}),
    /** `{ [questionId]: string[] }`; antes de enviar es el borrador autoguardado. */
    answers: jsonb("answers").$type<Record<string, string[]>>(),
    score: integer("score"),
    passed: boolean("passed"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.enrollmentId, table.assessmentId, table.attemptNumber),
    index("assessment_attempts_assessment_id_idx").on(table.assessmentId),
  ],
);

export const assessmentAttemptsRelations = relations(assessmentAttempts, ({ one }) => ({
  enrollment: one(enrollments, { fields: [assessmentAttempts.enrollmentId], references: [enrollments.id] }),
  assessment: one(assessments, { fields: [assessmentAttempts.assessmentId], references: [assessments.id] }),
}));
