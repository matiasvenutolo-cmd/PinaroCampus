import { Check, ClipboardCheck, FileText, Paperclip, Video } from "lucide-react";
import Link from "next/link";

import type { StructureModule } from "@/lib/courses/structure";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_ICON = { text: FileText, video: Video, resource: Paperclip, quiz: ClipboardCheck, exam: ClipboardCheck } as const;

/** Módulos plegables con el check de cada lección y la actual resaltada. */
export function Temario({
  modules,
  currentKey,
  completedIds,
  hrefFor,
}: {
  modules: StructureModule[];
  currentKey: string;
  completedIds: Set<string>;
  hrefFor: (lessonKey: string) => string;
}) {
  return (
    <nav aria-label="Temario del curso" className="flex flex-col">
      {modules.map((module, index) => {
        const containsCurrent = module.lessons.some((l) => l.key === currentKey);
        return (
          <details key={module.id} open={containsCurrent} className="group border-b border-border last:border-b-0">
            <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">Módulo {index + 1}</span>
                <span className="text-sm font-medium leading-snug">{module.title}</span>
              </span>
            </summary>
            <ul className="pb-2">
              {module.lessons.map((lesson) => {
                const Icon = TYPE_ICON[lesson.type];
                const done = completedIds.has(lesson.id);
                const current = lesson.key === currentKey;
                return (
                  <li key={lesson.id}>
                    <Link
                      href={hrefFor(lesson.key)}
                      prefetch={false}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex items-start gap-2.5 px-4 py-2 text-sm hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        current && "bg-[var(--primary-soft)] font-medium text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                          done ? "border-success bg-success text-white" : "border-border",
                        )}
                        aria-label={done ? "Completada" : undefined}
                      >
                        {done ? <Check className="size-3" aria-hidden /> : null}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">{lesson.title}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Icon className="size-3.5" aria-hidden />
                        {lesson.durationMinutes > 0 ? formatDuration(lesson.durationMinutes) : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </nav>
  );
}
