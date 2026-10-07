/**
 * Parte de la Fase 2 del seed (docs/09): categorías, cursos sincronizados y
 * asignados a las cámaras con precios, inscripciones con avance variado y
 * lista de espera. Se importa dinámicamente desde seed.ts, después de cargar
 * `.env.local` (importa `src/env.ts` transitivamente).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { drawAttempt } from "../src/lib/assessments/engine";
import { maybeIssueCertificate } from "../src/lib/certificates/issue";
import { syncAllCourses } from "../src/lib/courses/sync";
import { db } from "../src/lib/db";
import {
  assessmentAttempts,
  assessments,
  categories,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  tenantCourses,
  tenantMemberships,
  tenants,
  users,
  waitlistEntries,
} from "../src/lib/db/schema";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

const CATEGORIES = [
  { slug: "energia-y-sustentabilidad", name: "Energía y sustentabilidad", icon: "zap" },
  { slug: "seguridad-e-higiene", name: "Seguridad e higiene", icon: "hard-hat" },
  { slug: "gestion-y-liderazgo", name: "Gestión y liderazgo", icon: "users" },
  { slug: "tecnologia-e-ia", name: "Tecnología e IA", icon: "cpu" },
  { slug: "comercio-exterior", name: "Comercio exterior", icon: "globe" },
  { slug: "costos-y-finanzas", name: "Costos y finanzas", icon: "calculator" },
];

// Precio no socio en pesos; el de socio es la mitad (docs/09, cursos "Próximamente").
const COMING_SOON_PRICES: Record<string, number> = {
  "seguridad-e-higiene-en-planta-lo-esencial": 60000,
  "liderazgo-para-mandos-medios": 45000,
  "inteligencia-artificial-aplicada-a-la-pyme": 80000,
  "costos-industriales-para-tomar-decisiones": 70000,
  "exportar-por-primera-vez": 35000,
};

const DEMO_COURSE = "eficiencia-energetica-pymes-industriales";
const DEMO_PRICES: Record<string, { member: number; nonMember: number; featured: boolean }> = {
  civa: { member: 45000, nonMember: 90000, featured: true },
  ribera: { member: 0, nonMember: 60000, featured: true },
};

// % de avance de las inscripciones simuladas de CIVA (docs/09: 5 al 0-10%,
// 8 al 20-60%, 4 al 70-99%; 5 completados con certificado; 1 con el examen desaprobado).
const FILLER_PROGRESS = [0, 3, 5, 8, 10, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 95];

// Aciertos sobre las 15 preguntas del examen (docs/09: notas entre 72 y 96).
// 11/15 → 73, 12/15 → 80, 13/15 → 87, 14/15 → 93.
const COMPLETED_STUDENTS = [
  { correct: 11, daysAgo: 52 },
  { correct: 12, daysAgo: 38 },
  { correct: 13, daysAgo: 25 },
  { correct: 14, daysAgo: 12 },
  { correct: 13, daysAgo: 4 },
];
// Una persona con el examen desaprobado (9/15 → 60) y 2 intentos restantes.
const FAILED_STUDENT = { correct: 9, daysAgo: 3 };

export async function seedCourses() {
  const results = await syncAllCourses();
  const invalid = results.filter((r) => r.status === "invalid");
  if (invalid.length > 0) {
    throw new Error(`Cursos inválidos: ${invalid.map((r) => r.slug).join(", ")}. Corré pnpm courses:validate.`);
  }

  const allTenants = await db.select().from(tenants).where(eq(tenants.isDemo, true));
  const allCourses = await db.select().from(courses);

  for (const tenant of allTenants) {
    const categoryRows = await db
      .insert(categories)
      .values(CATEGORIES.map((c, index) => ({ tenantId: tenant.id, ...c, sortOrder: index })))
      .onConflictDoUpdate({
        target: [categories.tenantId, categories.slug],
        set: { name: sql`excluded.name`, icon: sql`excluded.icon`, sortOrder: sql`excluded.sort_order` },
      })
      .returning();
    const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

    await db
      .insert(tenantCourses)
      .values(
        allCourses
          .filter((c) => c.status === "published" || c.status === "coming_soon")
          .map((course, index) => {
            const demo = course.slug === DEMO_COURSE ? DEMO_PRICES[tenant.slug] : undefined;
            const nonMember = demo ? demo.nonMember : (COMING_SOON_PRICES[course.slug] ?? 50000);
            const member = demo ? demo.member : nonMember / 2;
            return {
              tenantId: tenant.id,
              courseId: course.id,
              categoryId: categoryBySlug.get(course.meta.suggestedCategory.slug) ?? null,
              visibility: "public" as const,
              priceMemberCents: Math.round(member * 100),
              priceNonMemberCents: Math.round(nonMember * 100),
              isFeatured: demo?.featured ?? false,
              sortOrder: index,
              publishedAt: new Date(),
            };
          }),
      )
      // Si el superadmin ya ajustó precios o visibilidad, el seed no los pisa.
      .onConflictDoNothing();
  }

  const [civa] = allTenants.filter((t) => t.slug === "civa");
  const [demoCourse] = allCourses.filter((c) => c.slug === DEMO_COURSE);
  if (!civa || !demoCourse) return;

  const [tenantCourse] = await db
    .select()
    .from(tenantCourses)
    .where(and(eq(tenantCourses.tenantId, civa.id), eq(tenantCourses.courseId, demoCourse.id)));

  const required = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.courseId, demoCourse.id), eq(lessons.isRequired, true)))
    .orderBy(asc(lessons.sortOrder));

  const students = await db
    .select({ id: users.id, email: users.email })
    .from(tenantMemberships)
    .innerJoin(users, eq(users.id, tenantMemberships.userId))
    .where(and(eq(tenantMemberships.tenantId, civa.id), eq(tenantMemberships.role, "student")))
    .orderBy(asc(users.email));
  const byEmail = new Map(students.map((s) => [s.email, s.id]));
  // Solo los alumnos ficticios del seed (`*.demo`): cualquier cuenta real que haya
  // entrado a una cámara (p. ej. el superadmin probando) queda afuera.
  const fillers = students.filter(
    (s) => s.email.endsWith(".demo") && !s.email.startsWith("alumno@") && !s.email.startsWith("avanzado@"),
  );

  const completedStart = FILLER_PROGRESS.length;
  const failedIndex = completedStart + COMPLETED_STUDENTS.length;
  const plan: { userId: string; pct: number; exam?: { correct: number; daysAgo: number; passes: boolean } }[] = [
    { userId: byEmail.get("alumno@civa.demo")!, pct: 40 },
    { userId: byEmail.get("avanzado@civa.demo")!, pct: 100 },
    ...FILLER_PROGRESS.map((pct, index) => ({ userId: fillers[index]!.id, pct })),
    ...COMPLETED_STUDENTS.map((exam, index) => ({
      userId: fillers[completedStart + index]!.id,
      pct: 100,
      exam: { ...exam, passes: true },
    })),
    { userId: fillers[failedIndex]!.id, pct: 100, exam: { ...FAILED_STUDENT, passes: false } },
  ];
  const [finalExam] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.courseId, demoCourse.id), eq(assessments.key, "examen-final")));

  for (const [index, { userId, pct, exam }] of plan.entries()) {
    const done = Math.min(required.length, Math.round((pct / 100) * required.length));
    const progressPct = required.length === 0 ? 0 : Math.round((done / required.length) * 100);
    const enrolledAt = daysAgo(88 - index * 4);
    // Los más recientes de la lista fueron vistos hace pocos días (para "activos 30 días").
    const lastViewed = daysAgo(1 + index * 2);
    const lastLesson = done > 0 ? required[done - 1] : null;

    const [enrollment] = await db
      .insert(enrollments)
      .values({
        tenantId: civa.id,
        userId,
        courseId: demoCourse.id,
        tenantCourseId: tenantCourse.id,
        source: "free",
        progressPct,
        lastLessonId: lastLesson?.id ?? null,
        enrolledAt,
      })
      .onConflictDoUpdate({
        target: [enrollments.tenantId, enrollments.userId, enrollments.courseId],
        set: { progressPct, lastLessonId: lastLesson?.id ?? null, enrolledAt },
      })
      .returning({ id: enrollments.id });

    if (done > 0) {
      await db
        .insert(lessonProgress)
        .values(
          required.slice(0, done).map((lesson, lessonIndex) => ({
            enrollmentId: enrollment.id,
            lessonId: lesson.id,
            status: "completed" as const,
            completedAt: new Date(enrolledAt.getTime() + (lessonIndex + 1) * DAY),
            lastViewedAt: lessonIndex === done - 1 ? lastViewed : new Date(enrolledAt.getTime() + (lessonIndex + 1) * DAY),
          })),
        )
        .onConflictDoUpdate({
          target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
          set: { status: "completed" },
        });
    }

    if (exam && finalExam) {
      await seedExamAttempt({
        tenantId: civa.id,
        enrollmentId: enrollment.id,
        assessment: finalExam,
        correct: exam.correct,
        submittedAt: daysAgo(exam.daysAgo),
        passes: exam.passes,
      });
    }
  }

  // Lista de espera: 12 entradas, la más pedida es IA aplicada a la PyME.
  const waitlistPlan: [string, number][] = [
    ["inteligencia-artificial-aplicada-a-la-pyme", 5],
    ["seguridad-e-higiene-en-planta-lo-esencial", 3],
    ["liderazgo-para-mandos-medios", 2],
    ["costos-industriales-para-tomar-decisiones", 1],
    ["exportar-por-primera-vez", 1],
  ];
  const comingSoon = await db
    .select()
    .from(courses)
    .where(inArray(courses.slug, waitlistPlan.map(([slug]) => slug)));
  let cursor = 0;
  for (const [slug, count] of waitlistPlan) {
    const course = comingSoon.find((c) => c.slug === slug);
    if (!course) continue;
    for (let i = 0; i < count; i++) {
      const student = fillers[(cursor++ + 3) % fillers.length]!;
      await db
        .insert(waitlistEntries)
        .values({ tenantId: civa.id, courseId: course.id, email: student.email, userId: student.id })
        .onConflictDoNothing();
    }
  }
}

/**
 * Un intento de examen ya corregido, con respuestas coherentes con la nota
 * (las primeras `correct` preguntas bien y el resto mal), y el certificado si
 * aprobó. Idempotente: el intento 1 se pisa y el certificado no se duplica.
 */
async function seedExamAttempt({
  tenantId,
  enrollmentId,
  assessment,
  correct,
  submittedAt,
  passes,
}: {
  tenantId: string;
  enrollmentId: string;
  assessment: typeof assessments.$inferSelect;
  correct: number;
  submittedAt: Date;
  passes: boolean;
}) {
  const draw = drawAttempt(assessment.questions, {
    drawCount: assessment.drawCount,
    shuffleQuestions: assessment.shuffleQuestions,
    shuffleOptions: assessment.shuffleOptions,
  });
  const byId = new Map(assessment.questions.map((q) => [q.id, q]));
  const answers: Record<string, string[]> = {};
  draw.questionIds.forEach((id, index) => {
    const question = byId.get(id)!;
    if (index < correct) {
      answers[id] = question.correct;
    } else {
      const wrong = (question.type === "true_false" ? ["true", "false"] : (question.options ?? []).map((o) => o.id)).find(
        (optionId) => !question.correct.includes(optionId),
      );
      if (wrong) answers[id] = [wrong];
    }
  });
  const score = Math.round((100 * correct) / draw.questionIds.length);

  await db
    .insert(assessmentAttempts)
    .values({
      enrollmentId,
      assessmentId: assessment.id,
      attemptNumber: 1,
      questionIds: draw.questionIds,
      optionOrders: draw.optionOrders,
      answers,
      score,
      passed: score >= (assessment.passingScore ?? 0),
      startedAt: new Date(submittedAt.getTime() - 25 * 60_000),
      submittedAt,
      expiresAt: new Date(submittedAt.getTime() + 5 * 60_000),
    })
    .onConflictDoUpdate({
      target: [assessmentAttempts.enrollmentId, assessmentAttempts.assessmentId, assessmentAttempts.attemptNumber],
      set: { score, passed: score >= (assessment.passingScore ?? 0), answers, submittedAt },
    });

  if (passes) {
    await maybeIssueCertificate(tenantId, enrollmentId, { sendEmail: false, issuedAt: submittedAt });
  }
}
