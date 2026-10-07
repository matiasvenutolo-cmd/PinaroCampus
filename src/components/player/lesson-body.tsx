import { ClipboardCheck, Video as VideoIcon } from "lucide-react";

import { AssessmentRunner } from "@/components/assessment/assessment-runner";
import { DownloadButton } from "@/components/mdx/lesson-extras";
import { LessonContent } from "@/components/mdx/lesson-content";
import { readCourseFile } from "@/lib/courses/files";
import type { StructureLesson } from "@/lib/courses/structure";
import type { AssessmentView } from "@/lib/assessments/service";
import { getVideoEmbedUrl } from "@/lib/courses/video";

async function loadSource(courseSlug: string, contentRef: string | null) {
  if (!contentRef) return null;
  try {
    return await readCourseFile(courseSlug, contentRef);
  } catch {
    return null;
  }
}

/** Contenido de una lección según su tipo (texto, video, recursos o evaluación). */
export async function LessonBody({
  courseSlug,
  lesson,
  checklists,
  readOnly,
  assessment,
  previewToken,
}: {
  courseSlug: string;
  lesson: StructureLesson;
  checklists: Record<string, number[]>;
  readOnly: boolean;
  /** Estado de la evaluación de esta lección (solo para el alumno inscripto). */
  assessment?: { view: AssessmentView; nextHref: string | null } | null;
  previewToken?: string;
}) {
  if (lesson.type === "quiz" || lesson.type === "exam") {
    if (assessment && !readOnly) {
      return (
        <AssessmentRunner
          courseSlug={courseSlug}
          lessonKey={lesson.key}
          initialView={assessment.view}
          nextHref={assessment.nextHref}
        />
      );
    }
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <ClipboardCheck className="mx-auto size-8 text-primary" aria-hidden />
        <p className="mt-3 text-lg font-semibold">
          {lesson.type === "exam" ? "Examen final" : "Repaso del módulo"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Las evaluaciones no se pueden rendir en la vista previa.
        </p>
      </div>
    );
  }

  const source = await loadSource(courseSlug, lesson.contentRef);
  if (source === null) {
    return <p className="text-muted-foreground">No pudimos cargar el contenido de esta lección.</p>;
  }

  const content = (
    <LessonContent
      source={source}
      courseSlug={courseSlug}
      lessonKey={lesson.key}
      checklists={checklists}
      readOnly={readOnly}
      previewToken={previewToken}
    />
  );

  if (lesson.type === "video") {
    const embedUrl = getVideoEmbedUrl(lesson.meta.video);
    if (!embedUrl) {
      return (
        <>
          <p className="mb-6 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <VideoIcon className="size-4" aria-hidden />
            Video en producción. Mientras tanto, acá tenés el guion.
          </p>
          {content}
        </>
      );
    }
    return (
      <>
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-black">
          <iframe
            src={embedUrl}
            title={lesson.title}
            className="size-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <details className="mt-6 rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer font-medium">Transcripción</summary>
          <div className="mt-3">{content}</div>
        </details>
      </>
    );
  }

  return (
    <>
      {content}
      {lesson.type === "resource" && lesson.meta.resources?.length ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Descargas</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {lesson.meta.resources.map((resource) => (
              <li key={resource.file} className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium">{resource.title}</p>
                {resource.description ? <p className="mt-1 text-sm text-muted-foreground">{resource.description}</p> : null}
                <DownloadButton href={`/api/course-files/${courseSlug}/${resource.file}${previewToken ? `?token=${encodeURIComponent(previewToken)}` : ""}`} label="Descargar" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
