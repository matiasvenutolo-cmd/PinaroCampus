import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CompleteLessonButton } from "@/components/player/complete-lesson-button";
import { LessonBody } from "@/components/player/lesson-body";
import { LessonViewTracker } from "@/components/player/lesson-view-tracker";
import { Temario } from "@/components/player/temario";
import { TemarioDrawer } from "@/components/player/temario-drawer";
import { buttonVariants } from "@/components/ui/button";
import { getAssessmentById } from "@/lib/assessments/data";
import { getAssessmentView } from "@/lib/assessments/service";
import { requireMembership } from "@/lib/auth/permissions";
import { getCourseAccess } from "@/lib/courses/access";
import { flattenLessons, getCourseStructure } from "@/lib/courses/structure";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDuration } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";

const TYPE_LABEL = { text: "Lectura", video: "Video", resource: "Recursos", quiz: "Repaso", exam: "Examen final" } as const;

type Params = Promise<{ domain: string; slug: string; lessonKey: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  return { title: slug.replaceAll("-", " ") };
}

export default async function LessonPage({ params }: { params: Params }) {
  const { domain, slug, lessonKey } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const { user } = await requireMembership(tenant.id);
  const access = await getCourseAccess(tenant.id, user.id, slug);
  if (!access?.enrollment) redirect(`/cursos/${slug}`);
  const { tenantCourse: course, enrollment } = access;

  const structure = await getCourseStructure(course.courseId);
  const flat = flattenLessons(structure);
  const index = flat.findIndex((l) => l.key === lessonKey);
  if (index === -1) notFound();
  const lesson = flat[index];
  const prev = flat[index - 1] ?? null;
  const next = flat[index + 1] ?? null;
  const moduleIndex = structure.findIndex((m) => m.lessons.some((l) => l.id === lesson.id));

  const progress = await forTenant(tenant.id).progress.listForEnrollment(enrollment.id);
  const completedIds = new Set(progress.filter((p) => p.status === "completed").map((p) => p.lessonId));
  const checklists = progress.find((p) => p.lessonId === lesson.id)?.meta.checklists ?? {};
  const isCompleted = completedIds.has(lesson.id);
  const canComplete = lesson.type !== "quiz" && lesson.type !== "exam";
  const examLesson = flat.find((l) => l.type === "exam");
  const allRequiredDone = enrollment.progressPct === 100;

  let assessment: { view: Awaited<ReturnType<typeof getAssessmentView>>; nextHref: string | null } | null = null;
  if ((lesson.type === "quiz" || lesson.type === "exam") && lesson.assessmentId) {
    const row = await getAssessmentById(lesson.assessmentId);
    if (row) {
      assessment = {
        view: await getAssessmentView({ tenantId: tenant.id, enrollment, assessment: row }),
        nextHref: next ? `/aprender/${slug}/${next.key}` : null,
      };
    }
  }

  const hrefFor = (key: string) => `/aprender/${slug}/${key}`;
  const temario = <Temario modules={structure} currentKey={lessonKey} completedIds={completedIds} hrefFor={hrefFor} />;
  const navButton = cn(buttonVariants({ variant: "outline", size: "lg" }), "h-9");

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-2">
          <TemarioDrawer title={course.title}>{temario}</TemarioDrawer>
          <Link href={`/cursos/${slug}`} className="min-w-0 truncate text-sm font-medium hover:underline">
            {course.title}
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div
                role="progressbar"
                aria-label="Avance del curso"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={enrollment.progressPct}
                className="h-2 w-32 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${enrollment.progressPct}%` }} />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{enrollment.progressPct}%</span>
            </div>
            <Link href="/mi-campus" className="text-sm text-muted-foreground hover:text-foreground">
              Salir del curso
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1">
        <aside className="hidden w-[280px] shrink-0 border-r border-border md:block">
          <div className="sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto">{temario}</div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-32 pt-8 md:pb-12">
          <article className="mx-auto max-w-[720px]">
            <p className="text-sm text-muted-foreground">
              Módulo {moduleIndex + 1} · {TYPE_LABEL[lesson.type]}
              {lesson.durationMinutes > 0 ? ` · ${formatDuration(lesson.durationMinutes)}` : ""}
            </p>
            <h1 className="mt-1 mb-6 text-balance text-3xl font-semibold leading-tight">{lesson.title}</h1>

            <LessonViewTracker courseSlug={slug} lessonKey={lesson.key} />
            <LessonBody courseSlug={slug} lesson={lesson} checklists={checklists} readOnly={false} assessment={assessment} />

            {allRequiredDone && examLesson && lesson.id !== examLesson.id ? (
              <div className="mt-10 flex items-center gap-3 rounded-xl border border-border p-4" style={{ background: "var(--primary-soft)" }}>
                <ListChecks className="size-6 shrink-0 text-primary" aria-hidden />
                <div className="flex-1">
                  <p className="font-medium">Ya podés rendir el examen final</p>
                  <p className="text-sm text-muted-foreground">Completaste todas las lecciones del curso.</p>
                </div>
                <Link href={hrefFor(examLesson.key)} className={cn(buttonVariants({ size: "lg" }), "h-9")}>
                  Ir al examen
                </Link>
              </div>
            ) : null}

            <nav
              aria-label="Navegación de la lección"
              className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-3 md:static md:mt-10 md:border-t md:bg-transparent md:px-0"
            >
              {prev ? (
                <Link href={hrefFor(prev.key)} prefetch={false} className={navButton} aria-label={`Anterior: ${prev.title}`}>
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Anterior</span>
                </Link>
              ) : (
                <span />
              )}
              {canComplete ? (
                <CompleteLessonButton courseSlug={slug} lessonKey={lesson.key} completed={isCompleted} />
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  href={hrefFor(next.key)}
                  prefetch={false}
                  className={cn(buttonVariants({ variant: isCompleted ? "default" : "outline", size: "lg" }), "h-9")}
                  aria-label={`Siguiente: ${next.title}`}
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </article>
        </main>
      </div>
    </div>
  );
}
