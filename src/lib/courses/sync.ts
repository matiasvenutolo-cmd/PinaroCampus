import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assessments, courseModules, courses, lessons } from "@/lib/db/schema";

import { listCourseSlugs } from "./files";
import { isLessonRequired } from "./rules";
import type { CourseMeta, LessonMeta } from "./schema";
import { validateCourse, type CourseIssue, type LoadedCourse } from "./validate";

export interface SyncResult {
  slug: string;
  status: "created" | "updated" | "unchanged" | "invalid";
  issues: CourseIssue[];
  lessons?: number;
}

/**
 * Upsert de un curso ya validado: cursos, módulos, evaluaciones y lecciones
 * por `slug`/`key` (docs/02, "Contenido de cursos: archivo → base"). Nunca
 * borra: lo que desaparece del JSON se archiva, así el progreso de los
 * alumnos (que apunta al `id` de la lección) no se pierde.
 */
export async function syncLoadedCourse(
  course: LoadedCourse,
  { force = false }: { force?: boolean } = {},
): Promise<"created" | "updated" | "unchanged"> {
  const { json, slug, contentHash } = course;

  const [existing] = await db.select().from(courses).where(eq(courses.slug, slug));
  if (existing && existing.contentHash === contentHash && existing.status !== "archived" && !force) {
    return "unchanged";
  }

  const meta: CourseMeta = {
    language: json.language,
    outcomes: json.outcomes,
    audience: json.audience,
    prerequisites: json.prerequisites,
    tags: json.tags,
    instructors: json.instructors,
    suggestedCategory: json.suggestedCategory,
    certificate: { enabled: json.certificate.enabled, title: json.certificate.title },
    completion: json.completion,
  };

  await db.transaction(async (tx) => {
    const courseValues = {
      slug,
      title: json.title,
      subtitle: json.subtitle,
      description: json.description,
      level: json.level,
      durationMinutes: json.durationMinutes,
      certificateHours: String(json.certificate.hours),
      coverUrl: json.cover ? `/api/course-files/${slug}/${json.cover}` : null,
      status: json.status,
      contentHash,
      schemaVersion: json.schemaVersion,
      meta,
      syncedAt: new Date(),
    };
    const [row] = await tx
      .insert(courses)
      .values(courseValues)
      .onConflictDoUpdate({ target: courses.slug, set: courseValues })
      .returning({ id: courses.id });
    const courseId = row.id;

    const moduleRows = await tx
      .insert(courseModules)
      .values(
        json.modules.map((m, index) => ({
          courseId,
          key: m.id,
          title: m.title,
          summary: m.summary,
          sortOrder: index,
        })),
      )
      .onConflictDoUpdate({
        target: [courseModules.courseId, courseModules.key],
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          sortOrder: sql`excluded.sort_order`,
          archivedAt: sql`null`,
        },
      })
      .returning({ id: courseModules.id, key: courseModules.key });
    const moduleIdByKey = new Map(moduleRows.map((r) => [r.key, r.id]));

    const assessmentIdByKey = new Map<string, string>();
    if (course.assessments.length > 0) {
      const assessmentRows = await tx
        .insert(assessments)
        .values(
          course.assessments.map((a) => ({
            courseId,
            key: a.id,
            kind: a.kind,
            title: a.title,
            description: a.description,
            passingScore: a.passingScore,
            maxAttempts: a.maxAttempts,
            cooldownMinutes: a.cooldownMinutes,
            timeLimitMinutes: a.timeLimitMinutes,
            drawCount: a.drawCount,
            shuffleQuestions: a.shuffleQuestions,
            shuffleOptions: a.shuffleOptions,
            showExplanations: a.showExplanations,
            questions: a.questions,
          })),
        )
        .onConflictDoUpdate({
          target: [assessments.courseId, assessments.key],
          set: {
            kind: sql`excluded.kind`,
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            passingScore: sql`excluded.passing_score`,
            maxAttempts: sql`excluded.max_attempts`,
            cooldownMinutes: sql`excluded.cooldown_minutes`,
            timeLimitMinutes: sql`excluded.time_limit_minutes`,
            drawCount: sql`excluded.draw_count`,
            shuffleQuestions: sql`excluded.shuffle_questions`,
            shuffleOptions: sql`excluded.shuffle_options`,
            showExplanations: sql`excluded.show_explanations`,
            questions: sql`excluded.questions`,
          },
        })
        .returning({ id: assessments.id, key: assessments.key });
      for (const r of assessmentRows) assessmentIdByKey.set(r.key, r.id);
    }

    const lessonDefs = json.modules.flatMap((m) => m.lessons.map((lesson) => ({ moduleKey: m.id, lesson })));
    await tx
      .insert(lessons)
      .values(
        lessonDefs.map(({ moduleKey, lesson }, index) => {
          const lessonMeta: LessonMeta = {};
          if (lesson.type === "video") lessonMeta.video = lesson.video;
          if (lesson.type === "resource") lessonMeta.resources = lesson.resources;
          return {
            courseId,
            moduleId: moduleIdByKey.get(moduleKey)!,
            key: lesson.id,
            title: lesson.title,
            type: lesson.type,
            durationMinutes: lesson.durationMinutes,
            isRequired: isLessonRequired(lesson),
            sortOrder: index,
            contentRef: "file" in lesson ? lesson.file : null,
            assessmentId:
              lesson.type === "quiz" || lesson.type === "exam"
                ? (assessmentIdByKey.get(lesson.assessment) ?? null)
                : null,
            meta: lessonMeta,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [lessons.courseId, lessons.key],
        set: {
          moduleId: sql`excluded.module_id`,
          title: sql`excluded.title`,
          type: sql`excluded.type`,
          durationMinutes: sql`excluded.duration_minutes`,
          isRequired: sql`excluded.is_required`,
          sortOrder: sql`excluded.sort_order`,
          contentRef: sql`excluded.content_ref`,
          assessmentId: sql`excluded.assessment_id`,
          meta: sql`excluded.meta`,
          archivedAt: sql`null`,
        },
      });

    // Lo que ya no está en course.json se archiva (nunca se borra).
    const now = new Date();
    await tx
      .update(lessons)
      .set({ archivedAt: now })
      .where(
        and(
          eq(lessons.courseId, courseId),
          isNull(lessons.archivedAt),
          notInArray(lessons.key, lessonDefs.map((d) => d.lesson.id)),
        ),
      );
    await tx
      .update(courseModules)
      .set({ archivedAt: now })
      .where(
        and(
          eq(courseModules.courseId, courseId),
          isNull(courseModules.archivedAt),
          notInArray(courseModules.key, json.modules.map((m) => m.id)),
        ),
      );
  });

  return existing ? "updated" : "created";
}

/** Valida y sincroniza todos los cursos de content/courses/. */
export async function syncAllCourses({ force = false }: { force?: boolean } = {}): Promise<SyncResult[]> {
  const slugs = await listCourseSlugs();
  const results: SyncResult[] = [];

  for (const slug of slugs) {
    const validation = await validateCourse(slug);
    if (!validation.course) {
      results.push({ slug, status: "invalid", issues: validation.issues });
      continue;
    }
    const status = await syncLoadedCourse(validation.course, { force });
    results.push({
      slug,
      status,
      issues: validation.issues,
      lessons: validation.course.json.modules.reduce((n, m) => n + m.lessons.length, 0),
    });
  }

  // Cursos de la base cuya carpeta ya no existe: se archivan. Con COURSES_DIR
  // alternativo (tests) no se hace: esa carpeta no es la fuente de verdad.
  if (process.env.COURSES_DIR) return results;
  const missing = await db
    .select({ id: courses.id })
    .from(courses)
    .where(slugs.length ? and(notInArray(courses.slug, slugs), inArray(courses.status, ["draft", "coming_soon", "published"])) : undefined);
  if (missing.length > 0) {
    await db
      .update(courses)
      .set({ status: "archived" })
      .where(inArray(courses.id, missing.map((m) => m.id)));
  }

  return results;
}
