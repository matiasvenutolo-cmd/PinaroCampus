// Intentos de evaluación 🔒. Solo se usan a través de `forTenant()`: la
// tabla no tiene `tenant_id` propio, así que cada operación verifica antes
// que la inscripción sea de este tenant (igual que el progreso de lecciones).
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../index";
import { assessmentAttempts, enrollments } from "../schema";

export type AssessmentAttempt = typeof assessmentAttempts.$inferSelect;

export function assessmentScope(tenantId: string) {
  async function ownEnrollment(enrollmentId: string) {
    const [row] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.id, enrollmentId)));
    return row ?? null;
  }

  return {
    attempts: {
      async list(enrollmentId: string, assessmentId: string): Promise<AssessmentAttempt[]> {
        if (!(await ownEnrollment(enrollmentId))) return [];
        return db
          .select()
          .from(assessmentAttempts)
          .where(and(eq(assessmentAttempts.enrollmentId, enrollmentId), eq(assessmentAttempts.assessmentId, assessmentId)))
          .orderBy(asc(assessmentAttempts.attemptNumber));
      },

      async findById(enrollmentId: string, attemptId: string): Promise<AssessmentAttempt | null> {
        if (!(await ownEnrollment(enrollmentId))) return null;
        const [row] = await db
          .select()
          .from(assessmentAttempts)
          .where(and(eq(assessmentAttempts.enrollmentId, enrollmentId), eq(assessmentAttempts.id, attemptId)));
        return row ?? null;
      },

      /** El intento empezado y sin enviar, si lo hay (recargar retoma el mismo). */
      async findOpen(enrollmentId: string, assessmentId: string): Promise<AssessmentAttempt | null> {
        if (!(await ownEnrollment(enrollmentId))) return null;
        const [row] = await db
          .select()
          .from(assessmentAttempts)
          .where(
            and(
              eq(assessmentAttempts.enrollmentId, enrollmentId),
              eq(assessmentAttempts.assessmentId, assessmentId),
              isNull(assessmentAttempts.submittedAt),
            ),
          )
          .orderBy(desc(assessmentAttempts.attemptNumber))
          .limit(1);
        return row ?? null;
      },

      /**
       * Crea el siguiente intento. Devuelve `null` si otro request ganó la
       * carrera (mismo `attempt_number`): el llamador relee el intento abierto.
       */
      async create(
        enrollmentId: string,
        assessmentId: string,
        data: {
          questionIds: string[];
          optionOrders: Record<string, string[]>;
          expiresAt: Date | null;
        },
      ): Promise<AssessmentAttempt | null> {
        if (!(await ownEnrollment(enrollmentId))) return null;
        const [row] = await db
          .insert(assessmentAttempts)
          .values({
            enrollmentId,
            assessmentId,
            attemptNumber: sql`(
              select coalesce(max(${assessmentAttempts.attemptNumber}), 0) + 1
              from ${assessmentAttempts}
              where ${assessmentAttempts.enrollmentId} = ${enrollmentId}
                and ${assessmentAttempts.assessmentId} = ${assessmentId}
            )`,
            questionIds: data.questionIds,
            optionOrders: data.optionOrders,
            expiresAt: data.expiresAt,
          })
          .onConflictDoNothing()
          .returning();
        return row ?? null;
      },

      /** Autoguardado del borrador; no toca intentos ya enviados. */
      async saveDraft(enrollmentId: string, attemptId: string, answers: Record<string, string[]>) {
        if (!(await ownEnrollment(enrollmentId))) return;
        await db
          .update(assessmentAttempts)
          .set({ answers })
          .where(
            and(
              eq(assessmentAttempts.id, attemptId),
              eq(assessmentAttempts.enrollmentId, enrollmentId),
              isNull(assessmentAttempts.submittedAt),
            ),
          );
      },

      /**
       * Cierra el intento. Condicional a `submitted_at is null`: si dos
       * requests llegan a la vez, solo uno corrige (el otro recibe `null`).
       */
      async finalize(
        enrollmentId: string,
        attemptId: string,
        data: { answers: Record<string, string[]>; score: number; passed: boolean | null; submittedAt: Date },
      ): Promise<AssessmentAttempt | null> {
        if (!(await ownEnrollment(enrollmentId))) return null;
        const [row] = await db
          .update(assessmentAttempts)
          .set(data)
          .where(
            and(
              eq(assessmentAttempts.id, attemptId),
              eq(assessmentAttempts.enrollmentId, enrollmentId),
              isNull(assessmentAttempts.submittedAt),
            ),
          )
          .returning();
        return row ?? null;
      },

      /** Mejor intento aprobado (mayor nota; el más viejo desempata). */
      async bestPassed(enrollmentId: string, assessmentId: string): Promise<AssessmentAttempt | null> {
        if (!(await ownEnrollment(enrollmentId))) return null;
        const [row] = await db
          .select()
          .from(assessmentAttempts)
          .where(
            and(
              eq(assessmentAttempts.enrollmentId, enrollmentId),
              eq(assessmentAttempts.assessmentId, assessmentId),
              eq(assessmentAttempts.passed, true),
            ),
          )
          .orderBy(desc(assessmentAttempts.score), asc(assessmentAttempts.attemptNumber))
          .limit(1);
        return row ?? null;
      },
    },
  };
}
