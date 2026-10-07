"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { completeLesson } from "@/lib/courses/actions";

export function CompleteLessonButton({
  courseSlug,
  lessonKey,
  completed,
}: {
  courseSlug: string;
  lessonKey: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-success/15 px-3 text-sm font-medium text-success">
        <Check className="size-4" aria-hidden />
        Completada
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        size="lg"
        className="h-9"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await completeLesson({ courseSlug, lessonKey });
            if (result.ok) {
              setError(null);
              router.refresh();
            } else {
              setError(result.error);
            }
          })
        }
      >
        {pending ? "Guardando…" : "Marcar como completada"}
      </Button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
