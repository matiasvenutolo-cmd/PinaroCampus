"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { updateUserProfile } from "@/lib/auth/user-profile";
import { maybeIssueCertificate } from "@/lib/certificates/issue";
import { getCourseAccess } from "@/lib/courses/access";
import { getLessonByKey } from "@/lib/courses/structure";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

import { getAssessmentById } from "./data";
import {
  getAssessmentView,
  saveDraft,
  startAttempt,
  submitAttempt,
  type AssessmentContext,
  type AssessmentView,
  type SubmitResult,
} from "./service";

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const lessonRef = z.object({ courseSlug: z.string().min(1), lessonKey: z.string().min(1) });

/** Tenant, usuario, inscripción vigente y evaluación de la lección: todo del servidor. */
async function resolveContext(input: z.infer<typeof lessonRef>): Promise<AssessmentContext | null> {
  const tenant = await getCurrentTenant();
  const session = await auth();
  if (!session?.user?.id) return null;
  const access = await getCourseAccess(tenant.id, session.user.id, input.courseSlug);
  if (!access?.enrollment) return null;
  const lesson = await getLessonByKey(access.tenantCourse.courseId, input.lessonKey);
  if (!lesson?.assessmentId || (lesson.type !== "quiz" && lesson.type !== "exam")) return null;
  const assessment = await getAssessmentById(lesson.assessmentId);
  if (!assessment) return null;
  return { tenantId: tenant.id, enrollment: access.enrollment, assessment };
}

const NO_ACCESS = { ok: false, error: "Sin acceso a esta evaluación" } as const;

/** Empieza un intento (o retoma el abierto) y devuelve el estado con las preguntas SIN respuestas. */
export async function startAssessment(input: z.infer<typeof lessonRef>): Promise<ActionResult<{ view: AssessmentView }>> {
  const parsed = lessonRef.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const ctx = await resolveContext(parsed.data);
  if (!ctx) return NO_ACCESS;

  const started = await startAttempt(ctx);
  if (!started.ok) return started;
  return { ok: true, view: await getAssessmentView(ctx) };
}

const answersSchema = z.record(z.string().max(100), z.array(z.string().max(100)).max(20)).refine(
  (value) => Object.keys(value).length <= 200,
  "Demasiadas respuestas",
);

const draftSchema = lessonRef.extend({ attemptId: z.uuid(), answers: answersSchema });

/** Autoguardado del borrador: recargar la página no pierde lo respondido. */
export async function saveAssessmentDraft(input: z.infer<typeof draftSchema>): Promise<ActionResult> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const ctx = await resolveContext(parsed.data);
  if (!ctx) return NO_ACCESS;
  await saveDraft(ctx, parsed.data.attemptId, parsed.data.answers);
  return { ok: true };
}

/** Corrige en el servidor y devuelve la nota (y la revisión si la política lo permite). */
export async function submitAssessment(input: z.infer<typeof draftSchema>): Promise<SubmitResult> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const ctx = await resolveContext(parsed.data);
  if (!ctx) return NO_ACCESS;

  const result = await submitAttempt(ctx, parsed.data.attemptId, parsed.data.answers);
  if (result.ok) revalidatePath(`/aprender/${parsed.data.courseSlug}`, "layout");
  return result;
}

const nameSchema = lessonRef.extend({
  firstName: z.string().trim().min(1, "Completá tu nombre").max(80),
  lastName: z.string().trim().min(1, "Completá tu apellido").max(80),
  dni: z.string().trim().max(20).optional(),
});

/** "¿Cómo querés que figure tu nombre en el certificado?": se pide solo si faltaba. */
export async function saveCertificateName(
  input: z.infer<typeof nameSchema>,
): Promise<ActionResult<{ certificate: { code: string } | null }>> {
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const ctx = await resolveContext(parsed.data);
  if (!ctx) return NO_ACCESS;

  const scoped = forTenant(ctx.tenantId);
  // Una vez emitido, el nombre queda fijo (docs/06).
  if (await scoped.certificates.latestForEnrollment(ctx.enrollment.id)) {
    return { ok: false, error: "Tu certificado ya fue emitido." };
  }
  const { firstName, lastName, dni } = parsed.data;
  await updateUserProfile(ctx.enrollment.userId, {
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    ...(dni ? { dni } : {}),
  });
  const issued = await maybeIssueCertificate(ctx.tenantId, ctx.enrollment.id);
  revalidatePath(`/aprender/${parsed.data.courseSlug}`, "layout");
  if (issued.status === "issued" || issued.status === "exists") {
    return { ok: true, certificate: { code: issued.certificate.code } };
  }
  return { ok: true, certificate: null };
}
