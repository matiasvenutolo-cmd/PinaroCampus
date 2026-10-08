/**
 * Partes de las Fases 2 a 4 del seed (docs/09): categorías, cursos sincronizados
 * y asignados a las cámaras con precios, inscripciones con avance variado,
 * lista de espera, certificados y la actividad comercial (órdenes y vacantes). Se importa dinámicamente desde seed.ts, después de cargar
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
  companies,
  enrollments,
  lessonProgress,
  lessons,
  orderCounters,
  orderItems,
  orders,
  payments,
  seatCodes,
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

    // El seed no pisa nada de lo que ya existe (otra corrida, o un alumno real que
    // pasó por la demo): una inscripción existente se deja tal cual.
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
      .onConflictDoNothing()
      .returning({ id: enrollments.id });
    if (!enrollment) continue;

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

  await seedCommerce({ tenantId: civa.id, courseId: demoCourse.id, tenantCourseId: tenantCourse.id });
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

// ---- Fase 4: actividad comercial de CIVA (docs/09) ----

const SEED_NOTE = "seed";
const MEMBER_PRICE_CENTS = 4_500_000;
const CIVA_FEE_BPS = 3000;

async function seedCommerce({ tenantId, courseId, tenantCourseId }: { tenantId: string; courseId: string; tenantCourseId: string }) {
  const [already] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.notes, SEED_NOTE))).limit(1);
  if (already) return;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  const [admin] = await db.select().from(users).where(eq(users.email, "admin@civa.demo"));
  const companyRows = await db.select().from(companies).where(eq(companies.tenantId, tenantId));
  const byName = (name: string) => companyRows.find((c) => c.legalName === name)!;

  // Alumnos de relleno (`*.demo`) con su inscripción al curso, para etiquetar cómo llegaron.
  const rows = await db
    .select({ userId: users.id, email: users.email, enrollmentId: enrollments.id, pct: enrollments.progressPct, source: enrollments.source, enrolledAt: enrollments.enrolledAt, companyId: tenantMemberships.companyId })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .innerJoin(tenantMemberships, and(eq(tenantMemberships.userId, users.id), eq(tenantMemberships.tenantId, tenantId)))
    .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.courseId, courseId), eq(enrollments.source, "free")))
    .orderBy(asc(users.email));
  const fillers = rows.filter((r) => r.email.endsWith(".demo") && !r.email.startsWith("alumno@") && !r.email.startsWith("avanzado@"));
  const partial = fillers.filter((r) => r.pct > 0 && r.pct < 100);
  const redeemers = partial.slice(0, 9);
  const buyers = fillers.filter((r) => !redeemers.includes(r)).slice(0, 14);

  async function newOrder(data: {
    buyerUserId: string;
    companyId: string | null;
    type: "individual" | "seat_pack";
    quantity: number;
    status: "paid" | "awaiting_payment" | "failed" | "expired";
    provider: "mock" | "manual";
    createdAt: Date;
  }) {
    const number = await nextOrderNumber();
    const total = MEMBER_PRICE_CENTS * data.quantity;
    const paid = data.status === "paid";
    const [order] = await db
      .insert(orders)
      .values({
        tenantId,
        buyerUserId: data.buyerUserId,
        companyId: data.companyId,
        number,
        type: data.type,
        status: data.status,
        pricingTier: "member",
        subtotalCents: total,
        totalCents: total,
        platformFeeCents: Math.round((total * CIVA_FEE_BPS) / 10_000),
        collectionMode: tenant.collectionMode,
        paymentProvider: data.provider,
        expiresAt: new Date(data.createdAt.getTime() + (data.provider === "manual" ? 7 : 3) * DAY),
        paidAt: paid ? new Date(data.createdAt.getTime() + 5 * 60_000) : null,
        fulfilledAt: paid ? new Date(data.createdAt.getTime() + 5 * 60_000) : null,
        notes: SEED_NOTE,
        createdAt: data.createdAt,
        updatedAt: data.createdAt,
      })
      .returning();
    await db.insert(orderItems).values({
      orderId: order.id,
      tenantCourseId,
      courseId,
      courseTitle: course.title,
      quantity: data.quantity,
      unitPriceCents: MEMBER_PRICE_CENTS,
      totalCents: total,
    });
    await db.insert(payments).values({
      tenantId,
      orderId: order.id,
      provider: data.provider,
      externalId: data.provider === "mock" ? `mock_seed_${number}` : null,
      externalReference: order.id,
      status: paid ? "approved" : data.status === "failed" ? "rejected" : "pending",
      amountCents: total,
      raw: { seed: true },
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
    });
    return order;
  }

  async function nextOrderNumber() {
    const [row] = await db
      .insert(orderCounters)
      .values({ tenantId, lastNumber: 1 })
      .onConflictDoUpdate({ target: orderCounters.tenantId, set: { lastNumber: sql`${orderCounters.lastNumber} + 1` } })
      .returning({ n: orderCounters.lastNumber });
    return `${tenant.shortName.toUpperCase()}-${String(row.n).padStart(6, "0")}`;
  }

  // 14 compras individuales pagadas con el pago simulado, repartidas en los últimos 90 días.
  for (const [index, buyer] of buyers.entries()) {
    const order = await newOrder({
      buyerUserId: buyer.userId,
      companyId: buyer.companyId,
      type: "individual",
      quantity: 1,
      status: "paid",
      provider: "mock",
      createdAt: new Date(buyer.enrolledAt.getTime() - 5 * 60_000 + index * 0),
    });
    await db.update(enrollments).set({ source: "purchase", orderId: order.id }).where(eq(enrollments.id, buyer.enrollmentId));
  }

  // Tres personas más con su orden sin completar: transferencia pendiente (hace 2 días), rechazada y vencida.
  const extras: { email: string; first: string; last: string; status: "awaiting_payment" | "failed" | "expired"; provider: "manual" | "mock"; ago: number }[] = [
    { email: "transferencia@civa.demo", first: "Marcos", last: "Ibarra", status: "awaiting_payment", provider: "manual", ago: 2 },
    { email: "rechazada@civa.demo", first: "Silvina", last: "Cabrera", status: "failed", provider: "mock", ago: 6 },
    { email: "vencida@civa.demo", first: "Gabriel", last: "Duarte", status: "expired", provider: "mock", ago: 12 },
  ];
  for (const extra of extras) {
    const [user] = await db
      .insert(users)
      .values({ email: extra.email, firstName: extra.first, lastName: extra.last, name: `${extra.first} ${extra.last}` })
      .onConflictDoUpdate({ target: users.email, set: { firstName: extra.first, lastName: extra.last, name: `${extra.first} ${extra.last}` } })
      .returning();
    await db
      .insert(tenantMemberships)
      .values({ tenantId, userId: user.id, role: "student", onboardedAt: new Date(), acceptedTermsAt: new Date() })
      .onConflictDoNothing();
    await newOrder({ buyerUserId: user.id, companyId: null, type: "individual", quantity: 1, status: extra.status, provider: extra.provider, createdAt: daysAgo(extra.ago) });
  }

  // Paquete de 10 vacantes de Fundición Los Aromos: 6 canjeadas (avances distintos), 2 enviadas, 2 disponibles.
  const aromos = byName("Fundición Los Aromos S.R.L.");
  const aromosBuyer = fillers.find((f) => f.companyId === aromos.id) ?? buyers[0];
  const pack = await newOrder({ buyerUserId: aromosBuyer.userId, companyId: aromos.id, type: "seat_pack", quantity: 10, status: "paid", provider: "mock", createdAt: daysAgo(40) });
  await seedSeatCodes({ orderId: pack.id, companyId: aromos.id, createdBy: aromosBuyer.userId, total: 10, redeemers: redeemers.slice(0, 6), sent: 2, sentDomain: "losaromos.demo" });

  // Paquete de 5 creado por la cámara, sin orden, para Metalmecánica Quintana: 3 canjeadas.
  const quintana = byName("Metalmecánica Quintana Hnos.");
  await seedSeatCodes({ orderId: null, companyId: quintana.id, createdBy: admin.id, total: 5, redeemers: redeemers.slice(6, 9), sent: 0, sentDomain: "quintanahnos.demo" });

  async function seedSeatCodes(data: { orderId: string | null; companyId: string; createdBy: string; total: number; redeemers: typeof redeemers; sent: number; sentDomain: string }) {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const make = (seed: number) => {
      let n = seed * 7919 + 104729;
      let out = "";
      for (let i = 0; i < 8; i++) {
        n = (n * 1103515245 + 12345) % 2147483648;
        out += alphabet[n % alphabet.length];
        if (i === 3) out += "-";
      }
      return out;
    };
    const base = data.orderId ? 1000 : 2000;
    for (let i = 0; i < data.total; i++) {
      const redeemer = data.redeemers[i];
      const sentTo = !redeemer && i < data.redeemers.length + data.sent ? `empleado${i}@${data.sentDomain}` : null;
      const [code] = await db
        .insert(seatCodes)
        .values({
          tenantId,
          courseId,
          tenantCourseId,
          orderId: data.orderId,
          companyId: data.companyId,
          code: make(base + i),
          status: redeemer ? "redeemed" : sentTo ? "sent" : "available",
          sentToEmail: redeemer ? `${redeemer.email}` : sentTo,
          sentAt: redeemer || sentTo ? daysAgo(30) : null,
          redeemedByUserId: redeemer?.userId ?? null,
          redeemedAt: redeemer ? daysAgo(20 - i) : null,
          createdByUserId: data.createdBy,
          createdAt: daysAgo(40),
        })
        .onConflictDoNothing()
        .returning();
      if (code && redeemer) {
        await db.update(enrollments).set({ source: "seat_code", seatCodeId: code.id }).where(eq(enrollments.id, redeemer.enrollmentId));
        // La empresa del comprador queda asociada a quien canjeó.
        await db.update(tenantMemberships).set({ companyId: data.companyId }).where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, redeemer.userId)));
      }
    }
  }
}
