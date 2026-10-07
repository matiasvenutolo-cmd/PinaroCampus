import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assessments, courses } from "@/lib/db/schema";

/** Evaluaciones y cursos son la biblioteca global (sin `tenant_id`). */
export async function getAssessmentById(id: string) {
  const [row] = await db.select().from(assessments).where(eq(assessments.id, id));
  return row ?? null;
}

export async function getAssessmentByKey(courseId: string, key: string) {
  const [row] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.key, key)));
  return row ?? null;
}

export async function getCourseById(id: string) {
  const [row] = await db.select().from(courses).where(eq(courses.id, id));
  return row ?? null;
}
