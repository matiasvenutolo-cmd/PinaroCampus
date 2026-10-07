import { Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LessonBody } from "@/components/player/lesson-body";
import { Temario } from "@/components/player/temario";
import { verifyCoursePreviewToken } from "@/lib/courses/preview-token";
import { flattenLessons, getCourseBySlug, getCourseStructure } from "@/lib/courses/structure";
import { formatDuration } from "@/lib/format";

// Vista previa firmada para que un docente revise el curso sin cuenta
// (docs/07, Fase 2). Solo lectura: no guarda progreso ni checklists.
export const metadata = { title: "Vista previa de curso", robots: { index: false, follow: false } };

export default async function CoursePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; lessonKey: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug, lessonKey } = await params;
  const { token } = await searchParams;
  if (!(await verifyCoursePreviewToken(slug, token))) notFound();

  const course = await getCourseBySlug(slug);
  if (!course) notFound();
  const structure = await getCourseStructure(course.id);
  const flat = flattenLessons(structure);
  const index = flat.findIndex((l) => l.key === lessonKey);
  if (index === -1) notFound();
  const lesson = flat[index];
  const prev = flat[index - 1];
  const next = flat[index + 1];
  const hrefFor = (key: string) => `/preview/${slug}/${key}?token=${encodeURIComponent(token!)}`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-center gap-2 bg-[#171717] px-4 py-2 text-sm text-white">
        <Eye className="size-4" aria-hidden />
        Vista previa para docentes · no guarda progreso
      </div>
      <div className="mx-auto flex w-full max-w-[1200px] flex-1">
        <aside className="hidden w-[280px] shrink-0 border-r border-border md:block">
          <p className="border-b border-border px-4 py-3 text-sm font-semibold">{course.title}</p>
          <Temario modules={structure} currentKey={lessonKey} completedIds={new Set()} hrefFor={hrefFor} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8">
          <article className="mx-auto max-w-[720px]">
            <p className="text-sm text-muted-foreground">
              {course.title}
              {lesson.durationMinutes > 0 ? ` · ${formatDuration(lesson.durationMinutes)}` : ""}
            </p>
            <h1 className="mt-1 mb-6 text-balance text-3xl font-semibold leading-tight">{lesson.title}</h1>
            <LessonBody courseSlug={slug} lesson={lesson} checklists={{}} readOnly previewToken={token} />
            <nav className="mt-10 flex justify-between text-sm">
              {prev ? <Link href={hrefFor(prev.key)} prefetch={false} className="text-primary hover:underline">← {prev.title}</Link> : <span />}
              {next ? <Link href={hrefFor(next.key)} prefetch={false} className="text-primary hover:underline">{next.title} →</Link> : <span />}
            </nav>
          </article>
        </main>
      </div>
    </div>
  );
}
