import "server-only";

import { getUserProfile } from "@/lib/auth/user-profile";
import { getAssessmentByKey, getCourseById } from "@/lib/assessments/data";
import { forTenant } from "@/lib/db/tenant-scope";
import type { Certificate } from "@/lib/db/scope/certificates";
import type { CertificateSnapshot } from "@/lib/db/schema";
import { certificateIssuedEmail } from "@/lib/email/templates/certificate-issued";
import { sendEmail } from "@/lib/email/send";
import { getTenantById } from "@/lib/tenant/resolve";
import { buildTenantUrl } from "@/lib/tenant/urls";

import { generateCertificateCode } from "./code";

export type IssueResult =
  | { status: "issued"; certificate: Certificate }
  /** Ya tenía uno (vigente o revocado): no se emite otro. */
  | { status: "exists"; certificate: Certificate }
  | { status: "not_eligible"; reason: string }
  /** Falta el nombre o el apellido: hay que pedírselos antes de emitir (docs/06). */
  | { status: "needs_name" }
  | { status: "disabled" };

const MAX_CODE_ATTEMPTS = 6;

export interface IssueOptions {
  /** `false` en el seed y en los tests (no manda el email). */
  sendEmail?: boolean;
  issuedAt?: Date;
}

/**
 * docs/06: evalúa la regla de `completion` del curso y, si se cumple, emite el
 * certificado. Idempotente: el índice único parcial por inscripción garantiza
 * que dos requests simultáneos (o una recarga) no emitan dos veces, y un
 * certificado revocado no se vuelve a emitir solo (para eso está `reissue`).
 */
export async function maybeIssueCertificate(
  tenantId: string,
  enrollmentId: string,
  options: IssueOptions = {},
): Promise<IssueResult> {
  const scoped = forTenant(tenantId);
  const enrollment = await scoped.enrollments.findById(enrollmentId);
  if (!enrollment || enrollment.status === "revoked") return { status: "not_eligible", reason: "enrollment" };

  const existing = await scoped.certificates.latestForEnrollment(enrollmentId);
  if (existing) {
    await scoped.enrollmentCompletion.markCompleted(enrollmentId, existing.issuedAt);
    return { status: "exists", certificate: existing };
  }

  const course = await getCourseById(enrollment.courseId);
  if (!course) return { status: "not_eligible", reason: "course" };
  if (!course.meta.certificate.enabled) return { status: "disabled" };

  const { requireAllRequiredLessons, finalAssessment } = course.meta.completion;
  if (requireAllRequiredLessons && enrollment.progressPct < 100) {
    return { status: "not_eligible", reason: "lessons" };
  }

  let score = 100;
  let graded = false;
  if (finalAssessment) {
    const assessment = await getAssessmentByKey(course.id, finalAssessment);
    if (!assessment) return { status: "not_eligible", reason: "assessment" };
    const best = await scoped.attempts.bestPassed(enrollmentId, assessment.id);
    if (!best || best.score === null) return { status: "not_eligible", reason: "exam" };
    score = best.score;
    graded = true;
  }

  return insertCertificate({ tenantId, enrollmentId, score, graded, replacesCertificateId: null, options });
}

/**
 * Admin: revoca el certificado con motivo y emite uno nuevo con otro código,
 * tomando el nombre y el DNI actuales del alumno (el caso típico es un error
 * de tipeo). Conserva la nota del original.
 */
export async function reissueCertificate(
  tenantId: string,
  certificateId: string,
  reason: string,
): Promise<IssueResult> {
  const scoped = forTenant(tenantId);
  const original = await scoped.certificates.findById(certificateId);
  if (!original) return { status: "not_eligible", reason: "certificate" };

  if (!original.revokedAt) {
    const revoked = await scoped.certificates.revoke(original.id, reason);
    if (!revoked) return { status: "not_eligible", reason: "already_revoked" };
  }

  return insertCertificate({
    tenantId,
    enrollmentId: original.enrollmentId,
    score: original.score,
    graded: original.snapshot.graded,
    replacesCertificateId: original.id,
    options: {},
  });
}

async function insertCertificate({
  tenantId,
  enrollmentId,
  score,
  graded,
  replacesCertificateId,
  options,
}: {
  tenantId: string;
  enrollmentId: string;
  score: number;
  graded: boolean;
  replacesCertificateId: string | null;
  options: IssueOptions;
}): Promise<IssueResult> {
  const scoped = forTenant(tenantId);
  const enrollment = await scoped.enrollments.findById(enrollmentId);
  if (!enrollment) return { status: "not_eligible", reason: "enrollment" };
  const [course, tenant, profile] = await Promise.all([
    getCourseById(enrollment.courseId),
    getTenantById(tenantId),
    getUserProfile(enrollment.userId),
  ]);
  if (!course || !tenant || !profile) return { status: "not_eligible", reason: "data" };

  const firstName = profile.firstName?.trim();
  const lastName = profile.lastName?.trim();
  if (!firstName || !lastName) return { status: "needs_name" };

  const config = tenant.certificateConfig;
  const snapshot: CertificateSnapshot = {
    tenantName: tenant.name,
    tenantShortName: tenant.shortName,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.theme.primary,
    title: course.meta.certificate.title,
    graded,
    signatories: config.signatories.map((s) => ({ name: s.name, role: s.role, signatureUrl: s.signatureUrl })),
    footerText: config.footerText?.trim() || null,
    showDni: config.showDni,
  };

  let certificate: Certificate | null = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !certificate; attempt++) {
    certificate = await scoped.certificates.insert({
      enrollmentId,
      userId: enrollment.userId,
      courseId: course.id,
      code: generateCertificateCode(),
      holderName: `${firstName} ${lastName}`,
      holderDni: profile.dni?.trim() || null,
      courseTitle: course.title,
      hours: course.certificateHours,
      score,
      issuedAt: options.issuedAt ?? new Date(),
      replacesCertificateId,
      snapshot,
    });
    if (!certificate) {
      // `null` = ya hay uno vigente (otro request ganó) o chocó el código.
      const active = await scoped.certificates.activeForEnrollment(enrollmentId);
      if (active) return { status: "exists", certificate: active };
    }
  }
  if (!certificate) throw new Error("No se pudo generar un código de certificado único");

  await scoped.enrollmentCompletion.markCompleted(enrollmentId, certificate.issuedAt);

  if (options.sendEmail !== false) {
    try {
      await sendCertificateEmail(tenantId, certificate, profile.email);
    } catch (error) {
      // El certificado ya está emitido; un error de email no lo deshace.
      console.error("[certificates] no se pudo enviar el email", error);
    }
  }
  return { status: "issued", certificate };
}

/** Email "¡Aprobaste!" (también lo usa "reenviar email" del panel). */
export async function sendCertificateEmail(tenantId: string, certificate: Certificate, toEmail: string) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return;
  const [certificatesUrl, verifyUrl] = await Promise.all([
    buildTenantUrl(tenantId, "/mi-campus/certificados"),
    buildTenantUrl(tenantId, `/verificar/${certificate.code}`),
  ]);
  const email = certificateIssuedEmail({
    tenant,
    holderName: certificate.holderName,
    courseTitle: certificate.courseTitle,
    code: certificate.code,
    certificatesUrl,
    verifyUrl,
  });
  await sendEmail({ tenantId, to: toEmail, replyTo: tenant.contactEmail, ...email });
}
