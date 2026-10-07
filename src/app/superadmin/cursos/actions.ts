"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSuperadmin } from "@/lib/auth/permissions";
import { signCoursePreviewToken } from "@/lib/courses/preview-token";
import { getCourseBySlug } from "@/lib/courses/structure";
import { syncAllCourses } from "@/lib/courses/sync";
import { db } from "@/lib/db";
import { categories, tenantCourses } from "@/lib/db/schema";
import { recordGlobalAudit } from "@/lib/db/tenant-scope";

/** Re-sincroniza content/courses/ a la base (el build de Vercel ya lo hace). */
export async function syncCoursesNow() {
  const admin = await requireSuperadmin();
  const results = await syncAllCourses({ force: true });
  await recordGlobalAudit({
    actorUserId: admin.id,
    action: "courses.sync",
    entityType: "course",
    data: { results: results.map((r) => ({ slug: r.slug, status: r.status })) },
  });
  const invalid = results.filter((r) => r.status === "invalid").length;
  redirect(`/superadmin/cursos?sync=${invalid > 0 ? `invalidos-${invalid}` : "ok"}`);
}

const pesos = z.coerce.number().min(0).max(100_000_000);

const assignmentSchema = z.object({
  categoryId: z.union([z.literal(""), z.uuid()]),
  visibility: z.enum(["public", "members_only", "hidden"]),
  priceMember: pesos,
  priceNonMember: pesos,
  accessDays: z.union([z.literal(""), z.coerce.number().int().positive().max(3650)]),
});

/** Asigna un curso a una cámara o actualiza sus precios/visibilidad. Nunca borra: despublicar = sacar del catálogo. */
export async function saveCourseAssignment(courseSlug: string, tenantId: string, formData: FormData) {
  const admin = await requireSuperadmin();
  const back = `/superadmin/cursos/${courseSlug}`;

  const parsed = assignmentSchema.safeParse({
    categoryId: formData.get("categoryId") ?? "",
    visibility: formData.get("visibility"),
    priceMember: formData.get("priceMember"),
    priceNonMember: formData.get("priceNonMember"),
    accessDays: formData.get("accessDays") ?? "",
  });
  if (!parsed.success) redirect(`${back}?error=datos-invalidos`);

  const course = await getCourseBySlug(courseSlug);
  if (!course) redirect("/superadmin/cursos");

  if (parsed.data.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, parsed.data.categoryId), eq(categories.tenantId, tenantId)));
    if (!category) redirect(`${back}?error=categoria`);
  }

  const [before] = await db
    .select()
    .from(tenantCourses)
    .where(and(eq(tenantCourses.tenantId, tenantId), eq(tenantCourses.courseId, course.id)));

  const values = {
    categoryId: parsed.data.categoryId || null,
    visibility: parsed.data.visibility,
    priceMemberCents: Math.round(parsed.data.priceMember * 100),
    priceNonMemberCents: Math.round(parsed.data.priceNonMember * 100),
    isFeatured: formData.get("isFeatured") === "on",
    enrollmentOpen: formData.get("enrollmentOpen") === "on",
    accessDays: parsed.data.accessDays === "" ? null : parsed.data.accessDays,
    publishedAt: formData.get("published") === "on" ? (before?.publishedAt ?? new Date()) : null,
  };

  await db
    .insert(tenantCourses)
    .values({ tenantId, courseId: course.id, ...values })
    .onConflictDoUpdate({ target: [tenantCourses.tenantId, tenantCourses.courseId], set: values });

  await recordGlobalAudit({
    actorUserId: admin.id,
    action: before ? "tenant_course.update" : "tenant_course.assign",
    entityType: "tenant_course",
    entityId: before?.id,
    data: {
      tenantId,
      courseSlug,
      before: before
        ? { priceMemberCents: before.priceMemberCents, priceNonMemberCents: before.priceNonMemberCents, visibility: before.visibility }
        : null,
      after: { priceMemberCents: values.priceMemberCents, priceNonMemberCents: values.priceNonMemberCents, visibility: values.visibility },
    },
  });

  redirect(`${back}?ok=1`);
}

/** Genera el link de vista previa firmado (14 días) y vuelve a la ficha del curso. */
export async function generatePreviewLink(courseSlug: string, firstLessonKey: string) {
  await requireSuperadmin();
  const token = await signCoursePreviewToken(courseSlug);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-pc-host") ?? "";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/preview/${courseSlug}/${firstLessonKey}?token=${encodeURIComponent(token)}`;
  redirect(`/superadmin/cursos/${courseSlug}?preview=${encodeURIComponent(url)}`);
}
