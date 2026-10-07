"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { requireMembership } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/viewer";
import { forTenant } from "@/lib/db/tenant-scope";
import { getUnitPrice } from "@/lib/pricing";
import { getCurrentTenant } from "@/lib/tenant/context";

import { maybeIssueCertificate } from "@/lib/certificates/issue";

import { getCourseAccess } from "./access";
import { getLessonByKey } from "./structure";

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const checklistSchema = z.object({
  courseSlug: z.string().min(1),
  lessonKey: z.string().min(1),
  checklistId: z.string().min(1).max(100),
  index: z.number().int().min(0).max(200),
  checked: z.boolean(),
});

/** Resuelve tenant + usuario + inscripción vigente; todo desde el servidor. */
async function resolveEnrollment(courseSlug: string) {
  const tenant = await getCurrentTenant();
  const session = await auth();
  if (!session?.user?.id) return null;
  const access = await getCourseAccess(tenant.id, session.user.id, courseSlug);
  if (!access?.enrollment) return null;
  return { tenant, access, enrollment: access.enrollment };
}

export async function toggleChecklistItem(input: z.infer<typeof checklistSchema>): Promise<ActionResult> {
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };
  const { courseSlug, lessonKey, checklistId, index, checked } = parsed.data;

  const ctx = await resolveEnrollment(courseSlug);
  if (!ctx) return { ok: false, error: "Sin acceso al curso" };
  const lesson = await getLessonByKey(ctx.access.tenantCourse.courseId, lessonKey);
  if (!lesson) return { ok: false, error: "Lección inexistente" };

  await forTenant(ctx.tenant.id).progress.setChecklistItem(ctx.enrollment.id, lesson.id, checklistId, index, checked);
  return { ok: true };
}

const completeSchema = z.object({ courseSlug: z.string().min(1), lessonKey: z.string().min(1) });

export async function completeLesson(input: z.infer<typeof completeSchema>): Promise<ActionResult<{ progressPct: number }>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const ctx = await resolveEnrollment(parsed.data.courseSlug);
  if (!ctx) return { ok: false, error: "Sin acceso al curso" };
  const lesson = await getLessonByKey(ctx.access.tenantCourse.courseId, parsed.data.lessonKey);
  if (!lesson) return { ok: false, error: "Lección inexistente" };
  // Los quizzes y el examen se completan al rendirlos, no a mano.
  if (lesson.type === "quiz" || lesson.type === "exam") return { ok: false, error: "Esta lección se completa al rendirla" };

  const progressPct = await forTenant(ctx.tenant.id).progress.complete(ctx.enrollment.id, lesson.id);
  // Si ya tenía el examen aprobado (p. ej. se agregó una lección después), completar la última emite el certificado.
  if (progressPct === 100) await maybeIssueCertificate(ctx.tenant.id, ctx.enrollment.id);
  return { ok: true, progressPct: progressPct ?? 0 };
}

/** Inscripción gratuita (precio 0). El cobro llega con la Fase 4. */
export async function enrollInCourse(courseSlug: string) {
  const tenant = await getCurrentTenant();
  const { user } = await requireMembership(tenant.id);
  const viewer = await getViewer(tenant);
  const back = `/cursos/${encodeURIComponent(courseSlug)}`;

  const access = await getCourseAccess(tenant.id, user.id, courseSlug);
  const tc = access?.tenantCourse;
  if (!tc || tc.status !== "published" || tc.visibility === "hidden") redirect(`${back}?error=no-disponible`);
  if (access.enrollment) redirect(`/aprender/${courseSlug}`);
  if (!tc.enrollmentOpen) redirect(`${back}?error=inscripcion-cerrada`);

  const tier = viewer?.tier ?? "non_member";
  if (tc.visibility === "members_only" && tier !== "member") redirect(`${back}?error=solo-socios`);
  if (getUnitPrice(tc, tier) > 0) redirect(`${back}?error=pago-pendiente`);

  const expiresAt = tc.accessDays ? new Date(Date.now() + tc.accessDays * 24 * 60 * 60 * 1000) : null;
  await forTenant(tenant.id).enrollments.create({
    userId: user.id,
    courseId: tc.courseId,
    tenantCourseId: tc.tenantCourseId,
    source: "free",
    expiresAt,
  });
  redirect(`/aprender/${courseSlug}`);
}

const waitlistSchema = z.object({ email: z.email(), companyName: z.string().trim().max(200).optional() });

/** "Avisame cuando esté": lista de espera de un curso `coming_soon`. */
export async function joinWaitlist(courseSlug: string, formData: FormData) {
  const tenant = await getCurrentTenant();
  const back = `/cursos/${encodeURIComponent(courseSlug)}`;
  const parsed = waitlistSchema.safeParse({
    email: formData.get("email"),
    companyName: formData.get("companyName") || undefined,
  });
  if (!parsed.success) redirect(`${back}?espera=email-invalido`);

  const scoped = forTenant(tenant.id);
  const tc = await scoped.catalog.findBySlug(courseSlug);
  if (!tc || tc.status !== "coming_soon" || tc.visibility === "hidden") redirect(`${back}?error=no-disponible`);

  const session = await auth();
  await scoped.waitlist.add({
    courseId: tc.courseId,
    email: parsed.data.email,
    userId: session?.user?.id ?? null,
    companyName: parsed.data.companyName,
  });
  redirect(`${back}?espera=ok`);
}

const viewedSchema = z.object({ courseSlug: z.string().min(1), lessonKey: z.string().min(1) });

/** "Dónde seguir": se llama desde el cliente al abrir una lección (no al renderizarla, para que el prefetch no cuente como vista). */
export async function markLessonViewed(input: z.infer<typeof viewedSchema>): Promise<ActionResult> {
  const parsed = viewedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const ctx = await resolveEnrollment(parsed.data.courseSlug);
  if (!ctx) return { ok: false, error: "Sin acceso al curso" };
  const lesson = await getLessonByKey(ctx.access.tenantCourse.courseId, parsed.data.lessonKey);
  if (!lesson) return { ok: false, error: "Lección inexistente" };

  await forTenant(ctx.tenant.id).progress.markViewed(ctx.enrollment.id, lesson.id);
  return { ok: true };
}
