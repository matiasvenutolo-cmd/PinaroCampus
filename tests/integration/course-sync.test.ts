import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { syncLoadedCourse } from "@/lib/courses/sync";
import { validateCourse } from "@/lib/courses/validate";
import { db } from "@/lib/db";
import { courses, enrollments, lessonProgress, lessons, tenantCourses, tenants, users } from "@/lib/db/schema";

// `pnpm courses:sync` contra la base real, con un curso chico y descartable.
// Usa `syncLoadedCourse` y no `syncAllCourses` a propósito: con otra carpeta de
// cursos, el segundo archivaría los cursos reales de la base.
const runId = Math.random().toString(36).slice(2, 8);
const slug = `test-sync-${runId}`;
const previousDir = process.env.COURSES_DIR;
let root: string;
let tenantId: string;
let userId: string;

const file = (rel: string) => path.join(root, slug, rel);
const readJson = () => JSON.parse(readFileSync(file("course.json"), "utf8"));
const writeJson = (json: unknown) => writeFileSync(file("course.json"), JSON.stringify(json, null, 2));

async function sync(force = false) {
  const validation = await validateCourse(slug);
  expect(validation.issues.filter((i) => i.level === "error")).toEqual([]);
  return syncLoadedCourse(validation.course!, { force });
}
const lessonRows = async (courseId: string) =>
  db.select().from(lessons).where(eq(lessons.courseId, courseId)).orderBy(lessons.sortOrder);

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), "pc-sync-"));
  mkdirSync(file("lessons"), { recursive: true });
  writeFileSync(file("lessons/uno.mdx"), "Primera lección.\n");
  writeFileSync(file("lessons/dos.mdx"), "Segunda lección.\n");
  writeJson({
    schemaVersion: 1,
    slug,
    status: "published",
    title: "Curso de prueba del sync",
    level: "inicial",
    durationMinutes: 20,
    suggestedCategory: { slug: "prueba", name: "Prueba" },
    modules: [
      {
        id: "m1",
        title: "Módulo 1",
        lessons: [
          { id: "uno", type: "text", title: "Uno", durationMinutes: 10, file: "lessons/uno.mdx" },
          { id: "dos", type: "text", title: "Dos", durationMinutes: 10, file: "lessons/dos.mdx" },
        ],
      },
    ],
  });
  process.env.COURSES_DIR = root;
});

afterAll(async () => {
  if (previousDir === undefined) delete process.env.COURSES_DIR;
  else process.env.COURSES_DIR = previousDir;
  await db.delete(courses).where(eq(courses.slug, slug));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
});

describe("courses:sync", () => {
  it("crea el curso con sus módulos y lecciones, y un segundo sync sin cambios no hace nada", async () => {
    expect(await sync()).toBe("created");
    const [course] = await db.select().from(courses).where(eq(courses.slug, slug));
    expect(course.status).toBe("published");
    expect((await lessonRows(course.id)).map((l) => l.key)).toEqual(["uno", "dos"]);
    expect(await sync()).toBe("unchanged");
  });

  it("al cambiar un .mdx se actualiza el hash, los ids de lección se mantienen y el progreso sigue", async () => {
    const [course] = await db.select().from(courses).where(eq(courses.slug, slug));
    const before = await lessonRows(course.id);

    [{ id: tenantId }] = await db
      .insert(tenants)
      .values({ slug: `test-sync-t-${runId}`, name: "t", shortName: "t", campusName: "t", contactEmail: "t@test.demo" })
      .returning({ id: tenants.id });
    [{ id: userId }] = await db.insert(users).values({ email: `sync-${runId}@test.demo` }).returning({ id: users.id });
    const [tc] = await db.insert(tenantCourses).values({ tenantId, courseId: course.id, publishedAt: new Date() }).returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ tenantId, userId, courseId: course.id, tenantCourseId: tc.id, source: "admin", progressPct: 50 })
      .returning();
    await db.insert(lessonProgress).values({ enrollmentId: enrollment.id, lessonId: before[0].id, status: "completed", completedAt: new Date() });

    writeFileSync(file("lessons/uno.mdx"), "Primera lección, ahora con otro texto.\n");
    expect(await sync()).toBe("updated");

    const [after] = await db.select().from(courses).where(eq(courses.slug, slug));
    expect(after.contentHash).not.toBe(course.contentHash);
    expect((await lessonRows(course.id)).map((l) => l.id)).toEqual(before.map((l) => l.id));
    const progress = await db.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollment.id));
    expect(progress).toHaveLength(1);
    expect(progress[0].lessonId).toBe(before[0].id);
  });

  it("una lección que sale del JSON se archiva (no se borra) y vuelve si reaparece", async () => {
    const [course] = await db.select().from(courses).where(eq(courses.slug, slug));
    const original = readJson();

    const without = structuredClone(original);
    without.modules[0].lessons = without.modules[0].lessons.slice(0, 1);
    writeJson(without);
    await sync();
    const archived = await db.select().from(lessons).where(and(eq(lessons.courseId, course.id), eq(lessons.key, "dos")));
    expect(archived).toHaveLength(1);
    expect(archived[0].archivedAt).not.toBeNull();

    writeJson(original);
    await sync();
    const [restored] = await db.select().from(lessons).where(and(eq(lessons.courseId, course.id), eq(lessons.key, "dos")));
    expect(restored.archivedAt).toBeNull();
    expect(restored.id).toBe(archived[0].id);
  });

  it("un curso inválido no se puede sincronizar", async () => {
    writeFileSync(file("lessons/uno.mdx"), "Texto\n\n<Foo />\n");
    const validation = await validateCourse(slug);
    expect(validation.course).toBeNull();
    expect(validation.issues.some((i) => i.message.includes("<Foo>"))).toBe(true);
    cpSync(file("lessons/dos.mdx"), file("lessons/uno.mdx")); // lo deja válido de nuevo
  });
});
