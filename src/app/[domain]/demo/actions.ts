"use server";

import { redirect } from "next/navigation";

import { createDemoSession } from "@/lib/auth/demo";
import { flattenLessons, getCourseStructure } from "@/lib/courses/structure";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

/** "Alumno con curso avanzado" (docs/09): cae en el examen final del curso que tiene con todas las lecciones completas. */
async function examPathOfAdvancedStudent(tenantId: string, email: string): Promise<string | null> {
  const scoped = forTenant(tenantId);
  const student = await scoped.memberships.findByEmail(email);
  if (!student) return null;

  const ready = (await scoped.enrollments.listForUser(student.user.id)).find((e) => e.status === "active" && e.progressPct === 100);
  if (!ready) return null;
  const exam = flattenLessons(await getCourseStructure(ready.courseId)).find((l) => l.type === "exam");
  return exam ? `/aprender/${ready.slug}/${exam.key}` : null;
}

export async function demoLoginAction(formData: FormData) {
  const tenant = await getCurrentTenant();
  const requested = formData.get("role");
  const role = requested === "admin" ? "admin" : requested === "advanced" ? "advanced" : "student";
  const prefix = role === "admin" ? "admin" : role === "advanced" ? "avanzado" : "alumno";
  const email = `${prefix}@${tenant.slug}.demo`;

  await createDemoSession(tenant, email);

  if (role === "admin") redirect("/admin");
  if (role === "advanced") redirect((await examPathOfAdvancedStudent(tenant.id, email)) ?? "/mi-campus");
  redirect("/mi-campus");
}
