import "server-only";

import { forTenant } from "@/lib/db/tenant-scope";

/**
 * El curso tal como lo ofrece esta cámara + la inscripción vigente del alumno
 * (activa o completada, no revocada ni vencida). `enrollment` es `null` si no
 * tiene acceso al contenido.
 */
export async function getCourseAccess(tenantId: string, userId: string, slug: string) {
  const scoped = forTenant(tenantId);
  const tenantCourse = await scoped.catalog.findBySlug(slug);
  if (!tenantCourse) return null;

  const found = await scoped.enrollments.findForCourse(userId, tenantCourse.courseId);
  const expired = found?.expiresAt ? found.expiresAt.getTime() < Date.now() : false;
  const enrollment = found && found.status !== "revoked" && found.status !== "expired" && !expired ? found : null;
  return { tenantCourse, enrollment };
}
