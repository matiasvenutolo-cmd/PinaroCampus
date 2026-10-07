import "server-only";

import { maybeIssueCertificate } from "@/lib/certificates/issue";
import { getCourseById } from "@/lib/assessments/data";
import { getLessonByAssessment } from "@/lib/courses/structure";
import { forTenant } from "@/lib/db/tenant-scope";
import type { AssessmentAttempt } from "@/lib/db/scope/assessments";
import type { assessments as assessmentsTable, enrollments as enrollmentsTable } from "@/lib/db/schema";

import {
  canReview,
  drawAttempt,
  gradeAttempt,
  optionsOf,
  sanitizeAnswers,
  toPublicQuestions,
  type ExplanationPolicy,
  type PublicQuestion,
} from "./engine";

type AssessmentRow = typeof assessmentsTable.$inferSelect;
type EnrollmentRow = typeof enrollmentsTable.$inferSelect;

/** Margen para el autoenvío del cliente cuando se vence el tiempo (red lenta). */
const SUBMIT_GRACE_MS = 30_000;

export interface ReviewItem {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  given: string[];
  correct: string[];
  isCorrect: boolean;
  explanation: string | null;
}

export interface AttemptResult {
  attemptId: string;
  attemptNumber: number;
  score: number;
  passed: boolean | null;
  correctCount: number;
  total: number;
  submittedAt: string;
  /** `null` si la política de explicaciones no permite revisar este intento. */
  review: ReviewItem[] | null;
}

export interface AssessmentView {
  kind: "quiz" | "exam";
  title: string;
  description: string;
  passingScore: number | null;
  maxAttempts: number | null;
  cooldownMinutes: number;
  timeLimitMinutes: number | null;
  questionCount: number;
  showExplanations: ExplanationPolicy;
  attemptsUsed: number;
  attemptsLeft: number | null;
  /** Hora del servidor: el temporizador del cliente se corrige con esto. */
  now: string;
  status: "locked" | "ready" | "cooldown" | "no_attempts" | "in_progress" | "passed";
  lockedReason?: string;
  cooldownUntil?: string;
  open?: { attemptId: string; questions: PublicQuestion[]; expiresAt: string | null; answers: Record<string, string[]> };
  history: { number: number; score: number; passed: boolean | null; submittedAt: string }[];
  /** Resultado del último intento enviado (con revisión si corresponde). */
  last: AttemptResult | null;
  /** Certificado de este curso, si el examen aprobado ya lo emitió. */
  certificate: { code: string } | null;
  needsName: boolean;
}

export interface AssessmentContext {
  tenantId: string;
  enrollment: EnrollmentRow;
  assessment: AssessmentRow;
}

function limitFor(assessment: AssessmentRow) {
  return assessment.kind === "exam" ? assessment.maxAttempts : null;
}

function cooldownFor(assessment: AssessmentRow) {
  return assessment.kind === "exam" ? assessment.cooldownMinutes : 0;
}

function policyOf(assessment: AssessmentRow): ExplanationPolicy {
  return assessment.showExplanations as ExplanationPolicy;
}

function toResult(attempt: AssessmentAttempt, assessment: AssessmentRow): AttemptResult {
  const answers = attempt.answers ?? {};
  const graded = gradeAttempt(assessment.questions, attempt.questionIds, answers);
  const byId = new Map(assessment.questions.map((q) => [q.id, q]));
  const showReview = canReview(policyOf(assessment), attempt.passed);

  const review: ReviewItem[] | null = showReview
    ? graded.results.map((result) => {
        const question = byId.get(result.questionId)!;
        const order = attempt.optionOrders[question.id];
        const all = optionsOf(question);
        return {
          id: question.id,
          prompt: question.prompt,
          options: order ? order.map((id) => all.find((o) => o.id === id)).filter((o) => o !== undefined) : all,
          given: answers[question.id] ?? [],
          correct: question.correct,
          isCorrect: result.correct,
          explanation: question.explanation ?? null,
        };
      })
    : null;

  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    score: attempt.score ?? graded.score,
    passed: attempt.passed,
    correctCount: graded.correctCount,
    total: graded.total,
    submittedAt: (attempt.submittedAt ?? new Date()).toISOString(),
    review,
  };
}

/**
 * Si el intento abierto ya venció, lo cierra corrigiendo el borrador
 * autoguardado (docs/05: "autoenvío al vencer el tiempo"). Devuelve el intento
 * actualizado.
 */
async function closeIfExpired(ctx: AssessmentContext, attempt: AssessmentAttempt): Promise<AssessmentAttempt> {
  if (attempt.submittedAt || !attempt.expiresAt || attempt.expiresAt.getTime() > Date.now()) return attempt;
  const closed = await finalize(ctx, attempt, attempt.answers ?? {}, attempt.expiresAt);
  return closed ?? attempt;
}

async function finalize(
  ctx: AssessmentContext,
  attempt: AssessmentAttempt,
  rawAnswers: Record<string, string[]>,
  submittedAt: Date,
): Promise<AssessmentAttempt | null> {
  const { assessment } = ctx;
  const answers = sanitizeAnswers(assessment.questions, attempt.questionIds, rawAnswers);
  const { score } = gradeAttempt(assessment.questions, attempt.questionIds, answers);
  const passed = assessment.passingScore === null ? null : score >= assessment.passingScore;

  const scoped = forTenant(ctx.tenantId);
  const closed = await scoped.attempts.finalize(ctx.enrollment.id, attempt.id, { answers, score, passed, submittedAt });
  if (!closed) return null; // otro request ya lo cerró

  // Quiz enviado (con cualquier nota) o examen aprobado: la lección queda completada.
  if (assessment.kind === "quiz" || passed) {
    const course = await getCourseById(ctx.enrollment.courseId);
    const lesson = course ? await getLessonByAssessment(course.id, assessment.id) : null;
    if (lesson) await scoped.progress.complete(ctx.enrollment.id, lesson.id);
  }
  if (assessment.kind === "exam" && passed) {
    await maybeIssueCertificate(ctx.tenantId, ctx.enrollment.id);
  }
  return closed;
}

export async function getAssessmentView(ctx: AssessmentContext): Promise<AssessmentView> {
  const { assessment, tenantId } = ctx;
  const scoped = forTenant(tenantId);

  let attempts = await scoped.attempts.list(ctx.enrollment.id, assessment.id);
  const openBefore = attempts.find((a) => !a.submittedAt);
  if (openBefore) {
    const closed = await closeIfExpired(ctx, openBefore);
    if (closed.submittedAt) attempts = await scoped.attempts.list(ctx.enrollment.id, assessment.id);
  }

  const submitted = attempts.filter((a) => a.submittedAt);
  const open = attempts.find((a) => !a.submittedAt) ?? null;
  const course = await getCourseById(ctx.enrollment.courseId);
  const enrollment = (await scoped.enrollments.findById(ctx.enrollment.id)) ?? ctx.enrollment;

  const limit = limitFor(assessment);
  const attemptsUsed = attempts.length;
  const attemptsLeft = limit === null ? null : Math.max(0, limit - attemptsUsed);
  const questionCount = Math.min(assessment.drawCount ?? assessment.questions.length, assessment.questions.length);
  const lastAttempt = submitted.at(-1) ?? null;
  const passedAlready = assessment.kind === "exam" && submitted.some((a) => a.passed === true);

  let status: AssessmentView["status"] = "ready";
  let lockedReason: string | undefined;
  let cooldownUntil: Date | undefined;

  if (open) {
    status = "in_progress";
  } else if (passedAlready) {
    status = "passed";
  } else if (
    assessment.kind === "exam" &&
    course?.meta.completion.requireAllRequiredLessons &&
    enrollment.progressPct < 100
  ) {
    status = "locked";
    lockedReason = "Completá todas las lecciones del curso para habilitar el examen.";
  } else if (attemptsLeft === 0) {
    status = "no_attempts";
  } else if (lastAttempt?.submittedAt && cooldownFor(assessment) > 0) {
    const until = new Date(lastAttempt.submittedAt.getTime() + cooldownFor(assessment) * 60_000);
    if (until.getTime() > Date.now()) {
      status = "cooldown";
      cooldownUntil = until;
    }
  }

  const certificate =
    assessment.kind === "exam" ? await scoped.certificates.activeForEnrollment(ctx.enrollment.id) : null;

  let needsName = false;
  if (assessment.kind === "exam" && passedAlready && !certificate && !(await scoped.certificates.latestForEnrollment(ctx.enrollment.id))) {
    const result = await maybeIssueCertificate(tenantId, ctx.enrollment.id);
    if (result.status === "needs_name") needsName = true;
  }

  return {
    kind: assessment.kind,
    title: assessment.title,
    description: assessment.description,
    passingScore: assessment.passingScore,
    maxAttempts: limit,
    cooldownMinutes: cooldownFor(assessment),
    timeLimitMinutes: assessment.kind === "exam" ? assessment.timeLimitMinutes : null,
    questionCount,
    showExplanations: policyOf(assessment),
    attemptsUsed,
    attemptsLeft,
    now: new Date().toISOString(),
    status,
    lockedReason,
    cooldownUntil: cooldownUntil?.toISOString(),
    open: open
      ? {
          attemptId: open.id,
          questions: toPublicQuestions(assessment.questions, open.questionIds, open.optionOrders),
          expiresAt: open.expiresAt?.toISOString() ?? null,
          answers: open.answers ?? {},
        }
      : undefined,
    history: submitted.map((a) => ({
      number: a.attemptNumber,
      score: a.score ?? 0,
      passed: a.passed,
      submittedAt: a.submittedAt!.toISOString(),
    })),
    last: lastAttempt ? toResult(lastAttempt, assessment) : null,
    certificate: certificate ? { code: certificate.code } : null,
    needsName,
  };
}

export type StartResult = { ok: true } | { ok: false; error: string };

/** Empieza un intento (o retoma el abierto). Toda regla se vuelve a chequear acá. */
export async function startAttempt(ctx: AssessmentContext): Promise<StartResult> {
  const view = await getAssessmentView(ctx);
  if (view.status === "in_progress") return { ok: true };
  if (view.status === "locked") return { ok: false, error: view.lockedReason ?? "El examen todavía no está habilitado." };
  if (view.status === "passed") return { ok: false, error: "Ya aprobaste este examen." };
  if (view.status === "no_attempts") return { ok: false, error: "No te quedan intentos." };
  if (view.status === "cooldown") return { ok: false, error: "Todavía tenés que esperar para volver a intentarlo." };

  const { assessment } = ctx;
  const draw = drawAttempt(assessment.questions, {
    drawCount: assessment.drawCount,
    shuffleQuestions: assessment.shuffleQuestions,
    shuffleOptions: assessment.shuffleOptions,
  });
  const limitMinutes = assessment.kind === "exam" ? assessment.timeLimitMinutes : null;
  const created = await forTenant(ctx.tenantId).attempts.create(ctx.enrollment.id, assessment.id, {
    ...draw,
    expiresAt: limitMinutes ? new Date(Date.now() + limitMinutes * 60_000) : null,
  });
  if (!created) {
    // Carrera (doble clic): si el otro request dejó un intento abierto, se usa ese.
    const open = await forTenant(ctx.tenantId).attempts.findOpen(ctx.enrollment.id, assessment.id);
    if (!open) return { ok: false, error: "No pudimos empezar el intento. Probá de nuevo." };
  }
  return { ok: true };
}

export async function saveDraft(ctx: AssessmentContext, attemptId: string, rawAnswers: Record<string, string[]>) {
  const scoped = forTenant(ctx.tenantId);
  const attempt = await scoped.attempts.findById(ctx.enrollment.id, attemptId);
  if (!attempt || attempt.assessmentId !== ctx.assessment.id || attempt.submittedAt) return;
  if (attempt.expiresAt && attempt.expiresAt.getTime() + SUBMIT_GRACE_MS < Date.now()) return;
  await scoped.attempts.saveDraft(
    ctx.enrollment.id,
    attemptId,
    sanitizeAnswers(ctx.assessment.questions, attempt.questionIds, rawAnswers),
  );
}

export type SubmitResult =
  | { ok: true; result: AttemptResult; certificate: { code: string } | null; needsName: boolean }
  | { ok: false; error: string };

/**
 * Corrige en el servidor. Idempotente: enviar dos veces el mismo intento
 * devuelve el mismo resultado. Pasado el tiempo (más un margen) se ignoran las
 * respuestas del request y se corrige el borrador autoguardado.
 */
export async function submitAttempt(
  ctx: AssessmentContext,
  attemptId: string,
  rawAnswers: Record<string, string[]>,
): Promise<SubmitResult> {
  const scoped = forTenant(ctx.tenantId);
  const attempt = await scoped.attempts.findById(ctx.enrollment.id, attemptId);
  if (!attempt || attempt.assessmentId !== ctx.assessment.id) return { ok: false, error: "Intento inexistente" };

  let finished = attempt;
  if (!attempt.submittedAt) {
    const late = attempt.expiresAt !== null && Date.now() > attempt.expiresAt.getTime() + SUBMIT_GRACE_MS;
    const answers = late ? (attempt.answers ?? {}) : rawAnswers;
    const submittedAt = attempt.expiresAt && Date.now() > attempt.expiresAt.getTime() ? attempt.expiresAt : new Date();
    const closed = await finalize(ctx, attempt, answers, submittedAt);
    finished = closed ?? (await scoped.attempts.findById(ctx.enrollment.id, attemptId)) ?? attempt;
  }
  if (!finished.submittedAt) return { ok: false, error: "No pudimos corregir el intento. Probá de nuevo." };

  const certificate =
    ctx.assessment.kind === "exam" && finished.passed
      ? await scoped.certificates.activeForEnrollment(ctx.enrollment.id)
      : null;
  let needsName = false;
  if (ctx.assessment.kind === "exam" && finished.passed && !certificate) {
    const latest = await scoped.certificates.latestForEnrollment(ctx.enrollment.id);
    if (!latest) needsName = (await maybeIssueCertificate(ctx.tenantId, ctx.enrollment.id)).status === "needs_name";
  }

  return {
    ok: true,
    result: toResult(finished, ctx.assessment),
    certificate: certificate ? { code: certificate.code } : null,
    needsName,
  };
}
