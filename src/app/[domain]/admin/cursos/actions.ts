"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

const schema = z.object({ email: z.email() });

/** Inscribe a mano a un alumno de la cámara (docs/07, Fase 2: "inscripción por admin"). */
export async function enrollStudentByEmail(courseSlug: string, formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user: admin } = await requireRole(tenant.id, "tenant_admin");
  const back = "/admin/cursos";

  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect(`${back}?error=email-invalido&curso=${courseSlug}`);

  const scoped = forTenant(tenant.id);
  const course = await scoped.catalog.findBySlug(courseSlug);
  if (!course || course.status !== "published") redirect(`${back}?error=curso&curso=${courseSlug}`);

  const student = await scoped.memberships.findByEmail(parsed.data.email);
  if (!student) redirect(`${back}?error=sin-alumno&curso=${courseSlug}`);

  const expiresAt = course.accessDays ? new Date(Date.now() + course.accessDays * 24 * 60 * 60 * 1000) : null;
  const { enrollment, created } = await scoped.enrollments.create({
    userId: student.user.id,
    courseId: course.courseId,
    tenantCourseId: course.tenantCourseId,
    source: "admin",
    expiresAt,
  });
  if (created) {
    await scoped.auditLog.record({
      actorUserId: admin.id,
      action: "enrollment.admin_create",
      entityType: "enrollment",
      entityId: enrollment.id,
      data: { courseSlug, email: parsed.data.email },
    });
  }
  redirect(`${back}?ok=${created ? "inscripto" : "ya-inscripto"}&curso=${courseSlug}`);
}
