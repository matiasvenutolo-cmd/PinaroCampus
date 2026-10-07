import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { courseModules, courses, lessons } from "@/lib/db/schema";

export type StructureLesson = typeof lessons.$inferSelect;
export interface StructureModule {
  id: string;
  key: string;
  title: string;
  summary: string;
  lessons: StructureLesson[];
}

/** Módulos y lecciones vigentes (no archivados) de un curso, en orden. */
export async function getCourseStructure(courseId: string): Promise<StructureModule[]> {
  const [modules, allLessons] = await Promise.all([
    db
      .select()
      .from(courseModules)
      .where(and(eq(courseModules.courseId, courseId), isNull(courseModules.archivedAt)))
      .orderBy(asc(courseModules.sortOrder)),
    db
      .select()
      .from(lessons)
      .where(and(eq(lessons.courseId, courseId), isNull(lessons.archivedAt)))
      .orderBy(asc(lessons.sortOrder)),
  ]);

  return modules.map((m) => ({
    id: m.id,
    key: m.key,
    title: m.title,
    summary: m.summary,
    lessons: allLessons.filter((l) => l.moduleId === m.id),
  }));
}

export function flattenLessons(structure: StructureModule[]): StructureLesson[] {
  return structure.flatMap((m) => m.lessons);
}

/** Curso global por slug (la biblioteca no tiene tenant). */
export async function getCourseBySlug(slug: string) {
  const [row] = await db.select().from(courses).where(eq(courses.slug, slug));
  return row ?? null;
}

export async function getLessonByKey(courseId: string, key: string) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.key, key), isNull(lessons.archivedAt)));
  return row ?? null;
}

/** La lección (quiz o examen) que muestra una evaluación. */
export async function getLessonByAssessment(courseId: string, assessmentId: string) {
  const [row] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), eq(lessons.assessmentId, assessmentId), isNull(lessons.archivedAt)));
  return row ?? null;
}
