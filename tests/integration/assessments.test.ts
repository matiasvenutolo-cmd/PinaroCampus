import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getAssessmentByKey, getCourseById } from "@/lib/assessments/data";
import {
  getAssessmentView,
  saveDraft,
  startAttempt,
  submitAttempt,
  type AssessmentContext,
} from "@/lib/assessments/service";
import { updateUserProfile } from "@/lib/auth/user-profile";
import { maybeIssueCertificate, reissueCertificate } from "@/lib/certificates/issue";
import { getPublicCertificate } from "@/lib/certificates/verify";
import { db } from "@/lib/db";
import { assessmentAttempts, courses, enrollments, tenants, users } from "@/lib/db/schema";
import { forTenant } from "@/lib/db/tenant-scope";

import { createTestStudent, seedProgress } from "../e2e/db";

// Cada consulta a Neon desde una notebook tarda ~170 ms: estos tests encadenan muchas.
vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

// Motor de evaluaciones y emisión de certificados contra la base real, con
// alumnos descartables (`*@civa.demo`: los emails quedan en el log, no salen).
const COURSE = "eficiencia-energetica-pymes-industriales";
const run = Math.random().toString(36).slice(2, 8);
const emails: string[] = [];

let civaId: string;
let riberaId: string;
let courseId: string;

async function student(label: string, options: { progress?: number; withoutName?: boolean } = {}) {
  const email = `t3-${label}-${run}@civa.demo`;
  emails.push(email);
  const { userId } = await createTestStudent({
    email,
    tenantSlug: "civa",
    memberStatus: "verified",
    enrollCourseSlug: COURSE,
    withoutName: options.withoutName,
  });
  await seedProgress(email, "civa", COURSE, options.progress ?? 999);
  const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.userId, userId));
  const assessment = (await getAssessmentByKey(courseId, "examen-final"))!;
  const ctx: AssessmentContext = { tenantId: civaId, enrollment, assessment };
  return { email, userId, ctx, enrollment };
}

/** Respuestas correctas para las preguntas del intento abierto, leídas del banco. */
async function correctAnswers(ctx: AssessmentContext, attemptId: string) {
  const [attempt] = await db.select().from(assessmentAttempts).where(eq(assessmentAttempts.id, attemptId));
  const byId = new Map(ctx.assessment.questions.map((q) => [q.id, q]));
  return Object.fromEntries(attempt.questionIds.map((id) => [id, byId.get(id)!.correct]));
}

beforeAll(async () => {
  const [civa] = await db.select().from(tenants).where(eq(tenants.slug, "civa"));
  const [ribera] = await db.select().from(tenants).where(eq(tenants.slug, "ribera"));
  const [course] = await db.select().from(courses).where(eq(courses.slug, COURSE));
  civaId = civa.id;
  riberaId = ribera.id;
  courseId = course.id;
});

afterAll(async () => {
  if (emails.length > 0) await db.delete(users).where(inArray(users.email, emails));
});

describe("examen final", () => {
  it("retoma el intento abierto en vez de crear otro, y no manda respuestas al cliente", async () => {
    const { ctx, enrollment } = await student("resume");
    expect((await startAttempt(ctx)).ok).toBe(true);
    expect((await startAttempt(ctx)).ok).toBe(true);

    const attempts = await forTenant(civaId).attempts.list(enrollment.id, ctx.assessment.id);
    expect(attempts).toHaveLength(1);

    const view = await getAssessmentView(ctx);
    expect(view.status).toBe("in_progress");
    expect(view.open?.questions).toHaveLength(15);
    const json = JSON.stringify(view);
    expect(json).not.toContain('"correct"');
    for (const question of ctx.assessment.questions) {
      if (question.explanation) expect(json).not.toContain(question.explanation);
    }
  });

  it("aprobar emite el certificado una sola vez, aunque se reenvíe o se recargue", async () => {
    const { email, ctx, enrollment } = await student("pass");
    await startAttempt(ctx);
    const open = (await getAssessmentView(ctx)).open!;
    const answers = await correctAnswers(ctx, open.attemptId);

    const first = await submitAttempt(ctx, open.attemptId, answers);
    expect(first.ok && first.result.score).toBe(100);
    expect(first.ok && first.result.passed).toBe(true);
    expect(first.ok && first.certificate?.code).toMatch(/^PC-/);

    // Reenviar el mismo intento devuelve el mismo resultado y no emite otro.
    const second = await submitAttempt(ctx, open.attemptId, {});
    expect(second.ok && second.result.score).toBe(100);
    await maybeIssueCertificate(civaId, enrollment.id);
    await maybeIssueCertificate(civaId, enrollment.id);

    const view = await getAssessmentView(ctx);
    expect(view.status).toBe("passed");
    expect(view.certificate?.code).toBe(first.ok ? first.certificate?.code : "");
    const [{ status }] = await db.select({ status: enrollments.status }).from(enrollments).where(eq(enrollments.id, enrollment.id));
    expect(status).toBe("completed");

    const rows = await forTenant(civaId).certificates.listForAdmin({ q: email });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(100);
  });

  it("un examen desaprobado no emite, descuenta un intento y exige esperar", async () => {
    const { ctx, email } = await student("fail");
    await startAttempt(ctx);
    const open = (await getAssessmentView(ctx)).open!;
    const result = await submitAttempt(ctx, open.attemptId, {});
    expect(result.ok && result.result.passed).toBe(false);
    expect(result.ok && result.certificate).toBeNull();
    // after_pass: sin revisión (y sin explicaciones) si no aprobó.
    expect(result.ok && result.result.review).toBeNull();

    const view = await getAssessmentView(ctx);
    expect(view.attemptsLeft).toBe(2);
    expect(view.status).toBe("cooldown");
    expect((await startAttempt(ctx)).ok).toBe(false);
    expect(await forTenant(civaId).certificates.listForAdmin({ q: email })).toHaveLength(0);
  });

  it("agotados los intentos no se puede seguir", async () => {
    const { ctx, email } = await student("exhaust");
    const { ageAttempts } = await import("../e2e/db");
    for (let i = 0; i < 3; i++) {
      await ageAttempts(email, 120);
      expect((await startAttempt(ctx)).ok).toBe(true);
      const open = (await getAssessmentView(ctx)).open!;
      await submitAttempt(ctx, open.attemptId, {});
    }
    await ageAttempts(email, 120);
    const view = await getAssessmentView(ctx);
    expect(view.status).toBe("no_attempts");
    expect(view.attemptsLeft).toBe(0);
    expect((await startAttempt(ctx)).ok).toBe(false);
  });

  it("no habilita el examen si faltan lecciones", async () => {
    const { ctx } = await student("locked", { progress: 3 });
    const view = await getAssessmentView(ctx);
    expect(view.status).toBe("locked");
    expect((await startAttempt(ctx)).ok).toBe(false);
  });

  it("al vencer el tiempo corrige el borrador autoguardado", async () => {
    const { ctx } = await student("expired");
    await startAttempt(ctx);
    const open = (await getAssessmentView(ctx)).open!;
    const answers = await correctAnswers(ctx, open.attemptId);
    await saveDraft(ctx, open.attemptId, answers);
    // Vencido hace 10 minutos.
    await db
      .update(assessmentAttempts)
      .set({ expiresAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(assessmentAttempts.id, open.attemptId));

    // Las respuestas "tardías" del request se ignoran: vale el borrador.
    const late = await submitAttempt(ctx, open.attemptId, {});
    expect(late.ok && late.result.score).toBe(100);
    expect(late.ok && late.result.passed).toBe(true);
  });

  it("sin nombre pide el nombre y emite al completarlo", async () => {
    const { ctx, userId, enrollment } = await student("noname", { withoutName: true });
    await startAttempt(ctx);
    const open = (await getAssessmentView(ctx)).open!;
    const result = await submitAttempt(ctx, open.attemptId, await correctAnswers(ctx, open.attemptId));
    expect(result.ok && result.needsName).toBe(true);
    expect(result.ok && result.certificate).toBeNull();

    await updateUserProfile(userId, { firstName: "Ana", lastName: "Pérez", name: "Ana Pérez" });
    const issued = await maybeIssueCertificate(civaId, enrollment.id, { sendEmail: false });
    expect(issued.status).toBe("issued");
    expect(issued.status === "issued" && issued.certificate.holderName).toBe("Ana Pérez");
  });
});

describe("certificado: verificación, revocación y reemisión", () => {
  it("valida, se revoca, y reemitir da otro código sin duplicar vigentes", async () => {
    const { email, ctx } = await student("lifecycle");
    await startAttempt(ctx);
    const open = (await getAssessmentView(ctx)).open!;
    const result = await submitAttempt(ctx, open.attemptId, await correctAnswers(ctx, open.attemptId));
    const original = result.ok ? result.certificate!.code : "";

    const valid = await getPublicCertificate(original);
    expect(valid.state).toBe("valid");
    expect(valid.state === "valid" && valid.holderName).toBe("Test Alumno");
    // La verificación pública no expone ni el DNI ni el motivo.
    expect(JSON.stringify(valid)).not.toMatch(/dni|reason|revokedReason/i);
    expect((await getPublicCertificate(original.toLowerCase())).state).toBe("valid");
    expect((await getPublicCertificate("PC-ZZZZ-ZZZZ")).state).toBe("not_found");

    const scoped = forTenant(civaId);
    const certificate = (await scoped.certificates.findByCode(original))!;
    await updateUserProfile(certificate.userId, { firstName: "Teresa", lastName: "Álvarez" });
    const reissued = await reissueCertificate(civaId, certificate.id, "Error de tipeo");
    expect(reissued.status).toBe("issued");
    const newCode = reissued.status === "issued" ? reissued.certificate.code : "";
    expect(newCode).not.toBe(original);

    const revoked = await getPublicCertificate(original);
    expect(revoked.state).toBe("revoked");
    expect(JSON.stringify(revoked)).not.toContain("tipeo");
    expect((await getPublicCertificate(newCode)).state).toBe("valid");

    // El reemitido toma el nombre actual y conserva la nota; solo hay uno vigente.
    const fresh = (await scoped.certificates.findByCode(newCode))!;
    expect(fresh.holderName).toBe("Teresa Álvarez");
    expect(fresh.score).toBe(100);
    expect(fresh.replacesCertificateId).toBe(certificate.id);
    const all = await scoped.certificates.listForAdmin({ q: email });
    expect(all.filter((c) => !c.revokedAt)).toHaveLength(1);

    // Un certificado revocado no se reemite solo con volver a evaluar.
    await scoped.certificates.revoke(fresh.id, "Prueba");
    const again = await maybeIssueCertificate(civaId, certificate.enrollmentId);
    expect(again.status).toBe("exists");
    expect((await scoped.certificates.listForAdmin({ q: email })).filter((c) => !c.revokedAt)).toHaveLength(0);
  });
});

describe("aislamiento entre cámaras", () => {
  it("otra cámara no ve intentos ni certificados ajenos", async () => {
    const { ctx, enrollment } = await student("isolation");
    await startAttempt(ctx);
    const open = (await getAssessmentView(ctx)).open!;
    const result = await submitAttempt(ctx, open.attemptId, await correctAnswers(ctx, open.attemptId));
    const code = result.ok ? result.certificate!.code : "";

    const ribera = forTenant(riberaId);
    expect(await ribera.certificates.findByCode(code)).toBeNull();
    expect(await ribera.attempts.list(enrollment.id, ctx.assessment.id)).toEqual([]);
    expect(await ribera.attempts.findById(enrollment.id, open.attemptId)).toBeNull();
    expect(await ribera.attempts.findOpen(enrollment.id, ctx.assessment.id)).toBeNull();
    expect((await ribera.certificates.listForAdmin({ q: code })).map((c) => c.code)).not.toContain(code);
    expect(await ribera.enrollments.findById(enrollment.id)).toBeNull();

    // No puede corregir ni guardar borradores sobre un intento de otra cámara.
    const foreign: AssessmentContext = { ...ctx, tenantId: riberaId };
    expect((await submitAttempt(foreign, open.attemptId, {})).ok).toBe(false);
    expect(await getCourseById(courseId)).not.toBeNull();
  });
});
