"use client";

import { useId } from "react";

import type { PublicQuestion } from "@/lib/assessments/engine";
import { cn } from "@/lib/utils";

/** Una pregunta con sus opciones (radio para respuesta única, casillas para múltiple). */
export function QuestionCard({
  index,
  total,
  question,
  selected,
  onChange,
  className,
}: {
  index: number;
  total: number;
  question: PublicQuestion;
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const name = useId();
  const multiple = question.type === "multiple";

  function toggle(optionId: string) {
    if (!multiple) return onChange([optionId]);
    onChange(selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]);
  }

  return (
    <fieldset className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      <legend className="sr-only">
        Pregunta {index + 1} de {total}
      </legend>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Pregunta {index + 1} de {total}
        {multiple ? " · Elegí todas las correctas" : ""}
      </p>
      <p className="mt-2 whitespace-pre-line text-base font-medium leading-snug">{question.prompt}</p>
      <div className="mt-4 flex flex-col gap-2">
        {question.options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                checked ? "border-primary bg-[var(--primary-soft)]" : "border-border hover:bg-muted",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={`${name}-${question.id}`}
                checked={checked}
                onChange={() => toggle(option.id)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
              />
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
