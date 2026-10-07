import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  courseModules,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  tenantCourses,
  tenants,
  users,
} from "@/lib/db/schema";
import { forTenant } from "@/lib/db/tenant-scope";

// Aislamiento de catálogo, inscripciones, progreso y lista de espera (Fase 2).
// Corre contra la base de desarrollo con tenants y curso descartables.
const runId = Math.random().toString(36).slice(2, 8);
const courseSlug = `test-iso-course-${runId}`;
const otherSlug = `test-iso-solo-a-${runId}`;
const email = `iso-courses-${runId}@test.demo`;

let tenantA: string;
let tenantB: string;
let courseId: string;
let onlyAId: string;
let lessonId: string;
let userId: string;
let enrollmentA: string;

beforeAll(async () => {
  const mk = async (slug: string) =>
    (
      await db
        .insert(tenants)
        .values({ slug, name: slug, shortName: slug, campusName: slug, contactEmail: `${slug}@test.demo` })
        .returning()
    )[0].id;
  tenantA = await mk(`test-iso-ca-${runId}`);
  tenantB = await mk(`test-iso-cb-${runId}`);

  const mkCourse = async (slug: string) =>
    (
      await db
        .insert(courses)
        .values({
          slug,
          title: slug,
          level: "inicial",
          durationMinutes: 60,
          status: "published",
          contentHash: "test",
          meta: {
            language: "es-AR",
            outcomes: [],
            audience: [],
            prerequisites: [],
            tags: [],
            instructors: [],
            suggestedCategory: { slug: "x", name: "X" },
            certificate: { enabled: false, title: "" },
            completion: { requireAllRequiredLessons: true, finalAssessment: null },
          },
        })
        .returning()
    )[0].id;
  courseId = await mkCourse(courseSlug);
  onlyAId = await mkCourse(otherSlug);

  const [module] = await db.insert(courseModules).values({ courseId, key: "m1", title: "M1" }).returning();
  [{ id: lessonId }] = await db
    .insert(lessons)
    .values({ courseId, moduleId: module.id, key: "l1", title: "L1", type: "text", contentRef: "x.mdx" })
    .returning({ id: lessons.id });

  const assign = async (tenantId: string, id: string, priceMember: number, priceNonMember: number) =>
    (
      await db
        .insert(tenantCourses)
        .values({ tenantId, courseId: id, priceMemberCents: priceMember, priceNonMemberCents: priceNonMember, publishedAt: new Date() })
        .returning()
    )[0];
  const tcA = await assign(tenantA, courseId, 100, 200);
  await assign(tenantB, courseId, 300, 400);
  await assign(tenantA, onlyAId, 1, 2);

  [{ id: userId }] = await db.insert(users).values({ email }).returning({ id: users.id });
  const created = await forTenant(tenantA).enrollments.create({
    userId,
    courseId,
    tenantCourseId: tcA.id,
    source: "admin",
  });
  enrollmentA = created.enrollment.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await db.delete(courses).where(inArray(courses.id, [courseId, onlyAId]));
});

describe("catálogo por cámara", () => {
  it("cada cámara ve su propio precio del mismo curso", async () => {
    const a = await forTenant(tenantA).catalog.findBySlug(courseSlug);
    const b = await forTenant(tenantB).catalog.findBySlug(courseSlug);
    expect([a?.priceMemberCents, a?.priceNonMemberCents]).toEqual([100, 200]);
    expect([b?.priceMemberCents, b?.priceNonMemberCents]).toEqual([300, 400]);
    expect(a?.tenantCourseId).not.toBe(b?.tenantCourseId);
  });

  it("un curso asignado solo a A no existe para B (ni en el listado ni por slug)", async () => {
    expect(await forTenant(tenantB).catalog.findBySlug(otherSlug)).toBeNull();
    const listB = await forTenant(tenantB).catalog.list();
    expect(listB.map((c) => c.slug)).not.toContain(otherSlug);
    const listA = await forTenant(tenantA).catalog.list();
    expect(listA.map((c) => c.slug)).toContain(otherSlug);
  });

  it("un curso sin publicar o oculto no aparece en el catálogo", async () => {
    await db
      .update(tenantCourses)
      .set({ publishedAt: null })
      .where(and(eq(tenantCourses.tenantId, tenantA), eq(tenantCourses.courseId, onlyAId)));
    expect((await forTenant(tenantA).catalog.list()).map((c) => c.slug)).not.toContain(otherSlug);
    await db
      .update(tenantCourses)
      .set({ publishedAt: new Date(), visibility: "hidden" })
      .where(and(eq(tenantCourses.tenantId, tenantA), eq(tenantCourses.courseId, onlyAId)));
    expect((await forTenant(tenantA).catalog.list()).map((c) => c.slug)).not.toContain(otherSlug);
  });
});

describe("inscripciones y progreso", () => {
  it("la inscripción de A no se ve desde B", async () => {
    expect(await forTenant(tenantA).enrollments.findForCourse(userId, courseId)).not.toBeNull();
    expect(await forTenant(tenantB).enrollments.findForCourse(userId, courseId)).toBeNull();
    expect(await forTenant(tenantB).enrollments.listForUser(userId)).toEqual([]);
    expect((await forTenant(tenantA).enrollments.listForUser(userId)).length).toBe(1);
  });

  it("inscribir dos veces es idempotente", async () => {
    const tc = await forTenant(tenantA).catalog.findBySlug(courseSlug);
    const again = await forTenant(tenantA).enrollments.create({
      userId,
      courseId,
      tenantCourseId: tc!.tenantCourseId,
      source: "free",
    });
    expect(again.created).toBe(false);
    expect(again.enrollment.id).toBe(enrollmentA);
  });

  it("B no puede leer ni escribir el progreso de una inscripción de A", async () => {
    const asB = forTenant(tenantB);
    expect(await asB.progress.listForEnrollment(enrollmentA)).toEqual([]);
    expect(await asB.progress.complete(enrollmentA, lessonId)).toBeNull();
    await asB.progress.markViewed(enrollmentA, lessonId);
    await asB.progress.setChecklistItem(enrollmentA, lessonId, "c1", 0, true);

    const rows = await db.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentA));
    expect(rows).toEqual([]);
  });

  it("A completa una lección: queda 100% y completar de nuevo no cambia nada", async () => {
    const asA = forTenant(tenantA);
    expect(await asA.progress.complete(enrollmentA, lessonId)).toBe(100);
    expect(await asA.progress.complete(enrollmentA, lessonId)).toBe(100);
    const rows = await db.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentA));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, enrollmentA));
    expect(enrollment.progressPct).toBe(100);
    expect(enrollment.lastLessonId).toBe(lessonId);
  });

  it("el checklist se guarda por ítem y se puede destildar", async () => {
    const asA = forTenant(tenantA);
    await asA.progress.setChecklistItem(enrollmentA, lessonId, "c1", 2, true);
    await asA.progress.setChecklistItem(enrollmentA, lessonId, "c1", 0, true);
    await asA.progress.setChecklistItem(enrollmentA, lessonId, "c1", 2, false);
    const [row] = await asA.progress.listForEnrollment(enrollmentA);
    expect(row.meta.checklists).toEqual({ c1: [0] });
    expect(row.status).toBe("completed"); // tildar un ítem no pisa el estado
  });
});

describe("lista de espera", () => {
  it("es por cámara y no duplica", async () => {
    await forTenant(tenantA).waitlist.add({ courseId, email: "Alguien@Test.demo" });
    await forTenant(tenantA).waitlist.add({ courseId, email: "alguien@test.demo" });
    expect(await forTenant(tenantA).waitlist.has(courseId, "ALGUIEN@test.demo")).toBe(true);
    expect(await forTenant(tenantB).waitlist.has(courseId, "alguien@test.demo")).toBe(false);
  });
});
