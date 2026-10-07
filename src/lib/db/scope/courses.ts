// Consultas 🔒 de catálogo, inscripciones, progreso y lista de espera.
// Solo se usan a través de `forTenant()` (src/lib/db/tenant-scope.ts): cada
// consulta filtra por `tenant_id` y el `enrollmentId` de las operaciones de
// progreso se verifica contra el tenant antes de tocar nada.
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

import { db } from "../index";
import {
  categories,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  tenantCourses,
  waitlistEntries,
} from "../schema";

const catalogColumns = {
  tenantCourseId: tenantCourses.id,
  visibility: tenantCourses.visibility,
  priceMemberCents: tenantCourses.priceMemberCents,
  priceNonMemberCents: tenantCourses.priceNonMemberCents,
  isFeatured: tenantCourses.isFeatured,
  sortOrder: tenantCourses.sortOrder,
  enrollmentOpen: tenantCourses.enrollmentOpen,
  accessDays: tenantCourses.accessDays,
  publishedAt: tenantCourses.publishedAt,
  categoryId: tenantCourses.categoryId,
  courseId: courses.id,
  slug: courses.slug,
  title: courses.title,
  subtitle: courses.subtitle,
  description: courses.description,
  level: courses.level,
  durationMinutes: courses.durationMinutes,
  certificateHours: courses.certificateHours,
  coverUrl: courses.coverUrl,
  status: courses.status,
  meta: courses.meta,
  categorySlug: categories.slug,
  categoryName: categories.name,
  categoryIcon: categories.icon,
};

export type CatalogCourse = Awaited<ReturnType<ReturnType<typeof courseScope>["catalog"]["list"]>>[number];

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function courseScope(tenantId: string) {
  const catalogBase = () =>
    db
      .select(catalogColumns)
      .from(tenantCourses)
      .innerJoin(courses, eq(courses.id, tenantCourses.courseId))
      .leftJoin(categories, eq(categories.id, tenantCourses.categoryId));

  const visibleInCatalog = and(
    eq(tenantCourses.tenantId, tenantId),
    ne(tenantCourses.visibility, "hidden"),
    isNotNull(tenantCourses.publishedAt),
    inArray(courses.status, ["published", "coming_soon"]),
  );

  /** Verifica que la inscripción sea de este tenant antes de operar sobre su progreso. */
  async function ownEnrollment(enrollmentId: string) {
    const [row] = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.id, enrollmentId)));
    return row ?? null;
  }

  async function recomputeProgress(enrollmentId: string) {
    const enrollment = await ownEnrollment(enrollmentId);
    if (!enrollment) return null;

    const [{ total }] = await db
      .select({ total: count() })
      .from(lessons)
      .where(and(eq(lessons.courseId, enrollment.courseId), eq(lessons.isRequired, true), sql`${lessons.archivedAt} is null`));
    const [{ done }] = await db
      .select({ done: count() })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .where(
        and(
          eq(lessonProgress.enrollmentId, enrollmentId),
          eq(lessonProgress.status, "completed"),
          eq(lessons.isRequired, true),
          sql`${lessons.archivedAt} is null`,
        ),
      );
    const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);
    await db
      .update(enrollments)
      .set({ progressPct })
      .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.id, enrollmentId)));
    return progressPct;
  }

  return {
    catalog: {
      /** Catálogo público de la cámara, con filtro por categoría y búsqueda. */
      list({ categoryId, q }: { categoryId?: string; q?: string } = {}) {
        const search = q?.trim();
        return catalogBase()
          .where(
            and(
              visibleInCatalog,
              categoryId ? eq(tenantCourses.categoryId, categoryId) : undefined,
              search
                ? or(
                    ilike(courses.title, `%${escapeLike(search)}%`),
                    ilike(courses.subtitle, `%${escapeLike(search)}%`),
                    ilike(courses.description, `%${escapeLike(search)}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(tenantCourses.isFeatured), asc(tenantCourses.sortOrder), asc(courses.title));
      },
      featured(limit = 3) {
        return catalogBase()
          .where(and(visibleInCatalog, eq(tenantCourses.isFeatured, true)))
          .orderBy(asc(tenantCourses.sortOrder), asc(courses.title))
          .limit(limit);
      },
      /** Cursos por categoría (para el home). */
      async countByCategory() {
        return db
          .select({ categoryId: tenantCourses.categoryId, total: count() })
          .from(tenantCourses)
          .innerJoin(courses, eq(courses.id, tenantCourses.courseId))
          .where(visibleInCatalog)
          .groupBy(tenantCourses.categoryId);
      },
      /** Un curso por slug, incluso los `hidden` (la página decide qué mostrar). */
      async findBySlug(slug: string) {
        const [row] = await catalogBase().where(
          and(eq(tenantCourses.tenantId, tenantId), eq(courses.slug, slug)),
        );
        return row ?? null;
      },
      /** Todo lo asignado a la cámara, para el panel de admin. */
      listAssigned() {
        return catalogBase()
          .where(eq(tenantCourses.tenantId, tenantId))
          .orderBy(asc(tenantCourses.sortOrder), asc(courses.title));
      },
    },

    enrollments: {
      async findForCourse(userId: string, courseId: string) {
        const [row] = await db
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.tenantId, tenantId),
              eq(enrollments.userId, userId),
              eq(enrollments.courseId, courseId),
            ),
          );
        return row ?? null;
      },
      /** Mis cursos: inscripción + datos del curso + lección donde quedó. */
      listForUser(userId: string) {
        return db
          .select({
            enrollmentId: enrollments.id,
            status: enrollments.status,
            progressPct: enrollments.progressPct,
            enrolledAt: enrollments.enrolledAt,
            completedAt: enrollments.completedAt,
            expiresAt: enrollments.expiresAt,
            lastLessonKey: lessons.key,
            courseId: courses.id,
            slug: courses.slug,
            title: courses.title,
            subtitle: courses.subtitle,
            durationMinutes: courses.durationMinutes,
            categorySlug: categories.slug,
            categoryIcon: categories.icon,
          })
          .from(enrollments)
          .innerJoin(courses, eq(courses.id, enrollments.courseId))
          .innerJoin(tenantCourses, eq(tenantCourses.id, enrollments.tenantCourseId))
          .leftJoin(categories, eq(categories.id, tenantCourses.categoryId))
          .leftJoin(lessons, eq(lessons.id, enrollments.lastLessonId))
          .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.userId, userId)))
          .orderBy(desc(enrollments.enrolledAt));
      },
      /** Idempotente: si ya estaba inscripto devuelve la inscripción existente. */
      async create(data: {
        userId: string;
        courseId: string;
        tenantCourseId: string;
        source: "free" | "admin" | "purchase" | "seat_code";
        expiresAt?: Date | null;
      }) {
        const [created] = await db
          .insert(enrollments)
          .values({ ...data, tenantId, expiresAt: data.expiresAt ?? null })
          .onConflictDoNothing()
          .returning();
        if (created) return { enrollment: created, created: true };
        const existing = await this.findForCourse(data.userId, data.courseId);
        return { enrollment: existing!, created: false };
      },
      /** Cantidad de inscriptos por curso (panel de admin). */
      countByCourse() {
        return db
          .select({ courseId: enrollments.courseId, total: count() })
          .from(enrollments)
          .where(eq(enrollments.tenantId, tenantId))
          .groupBy(enrollments.courseId);
      },
    },

    progress: {
      async listForEnrollment(enrollmentId: string) {
        if (!(await ownEnrollment(enrollmentId))) return [];
        return db.select().from(lessonProgress).where(eq(lessonProgress.enrollmentId, enrollmentId));
      },
      /** Marca la lección como vista y la deja como "dónde seguir". */
      async markViewed(enrollmentId: string, lessonId: string) {
        if (!(await ownEnrollment(enrollmentId))) return;
        const now = new Date();
        await db
          .insert(lessonProgress)
          .values({ enrollmentId, lessonId, status: "started", lastViewedAt: now })
          .onConflictDoUpdate({
            target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
            set: { lastViewedAt: now },
          });
        await db
          .update(enrollments)
          .set({ lastLessonId: lessonId })
          .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.id, enrollmentId)));
      },
      /** Idempotente: completar dos veces no cambia nada. Devuelve el nuevo % de avance. */
      async complete(enrollmentId: string, lessonId: string) {
        if (!(await ownEnrollment(enrollmentId))) return null;
        const now = new Date();
        await db
          .insert(lessonProgress)
          .values({ enrollmentId, lessonId, status: "completed", completedAt: now, lastViewedAt: now })
          .onConflictDoUpdate({
            target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
            set: {
              status: "completed",
              completedAt: sql`coalesce(${lessonProgress.completedAt}, excluded.completed_at)`,
              lastViewedAt: now,
            },
          });
        await db
          .update(enrollments)
          .set({ lastLessonId: lessonId })
          .where(and(eq(enrollments.tenantId, tenantId), eq(enrollments.id, enrollmentId)));
        return recomputeProgress(enrollmentId);
      },
      /** Tilda o destilda un ítem de un `<Checklist>` (lesson_progress.meta.checklists). */
      async setChecklistItem(
        enrollmentId: string,
        lessonId: string,
        checklistId: string,
        index: number,
        checked: boolean,
      ) {
        if (!(await ownEnrollment(enrollmentId))) return;
        const [existing] = await db
          .select()
          .from(lessonProgress)
          .where(and(eq(lessonProgress.enrollmentId, enrollmentId), eq(lessonProgress.lessonId, lessonId)));
        const checklists = { ...(existing?.meta.checklists ?? {}) };
        const current = new Set(checklists[checklistId] ?? []);
        if (checked) current.add(index);
        else current.delete(index);
        checklists[checklistId] = [...current].sort((a, b) => a - b);

        const now = new Date();
        await db
          .insert(lessonProgress)
          .values({ enrollmentId, lessonId, status: "started", lastViewedAt: now, meta: { checklists } })
          .onConflictDoUpdate({
            target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
            set: { meta: { ...(existing?.meta ?? {}), checklists }, lastViewedAt: now },
          });
      },
    },

    waitlist: {
      async has(courseId: string, email: string) {
        const [row] = await db
          .select({ id: waitlistEntries.id })
          .from(waitlistEntries)
          .where(
            and(
              eq(waitlistEntries.tenantId, tenantId),
              eq(waitlistEntries.courseId, courseId),
              eq(waitlistEntries.email, email.toLowerCase()),
            ),
          );
        return Boolean(row);
      },
      async add(data: { courseId: string; email: string; userId?: string | null; companyName?: string | null }) {
        await db
          .insert(waitlistEntries)
          .values({
            tenantId,
            courseId: data.courseId,
            email: data.email.toLowerCase(),
            userId: data.userId ?? null,
            companyName: data.companyName ?? null,
          })
          .onConflictDoNothing();
      },
    },
  };
}
