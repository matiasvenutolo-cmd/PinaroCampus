import { notFound, redirect } from "next/navigation";

import { requireMembership } from "@/lib/auth/permissions";
import { getCourseAccess } from "@/lib/courses/access";
import { pickContinueLesson } from "@/lib/courses/continue";
import { flattenLessons, getCourseStructure } from "@/lib/courses/structure";
import { forTenant } from "@/lib/db/tenant-scope";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

/** "Continuar": manda a la lección donde el alumno tiene que seguir. */
export default async function ContinueCoursePage({ params }: { params: Promise<{ domain: string; slug: string }> }) {
  const { domain, slug } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const { user } = await requireMembership(tenant.id);
  const access = await getCourseAccess(tenant.id, user.id, slug);
  if (!access?.enrollment) redirect(`/cursos/${slug}`);

  const flat = flattenLessons(await getCourseStructure(access.tenantCourse.courseId));
  const progress = await forTenant(tenant.id).progress.listForEnrollment(access.enrollment.id);
  const completed = new Set(progress.filter((p) => p.status === "completed").map((p) => p.lessonId));

  const target = pickContinueLesson(flat, completed, access.enrollment.lastLessonId);
  if (!target) notFound();
  redirect(`/aprender/${slug}/${target.key}`);
}
