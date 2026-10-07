import { Check, X } from "lucide-react";

import type { ReviewItem } from "@/lib/assessments/service";
import { cn } from "@/lib/utils";

/** Revisión de un intento: tu respuesta, la correcta y la explicación. */
export function ReviewList({ items }: { items: ReviewItem[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {items.map((item, index) => (
        <li key={item.id} className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-start gap-2 text-sm font-medium">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white",
                item.isCorrect ? "bg-success" : "bg-danger",
              )}
            >
              {item.isCorrect ? <Check className="size-3.5" aria-label="Correcta" /> : <X className="size-3.5" aria-label="Incorrecta" />}
            </span>
            <span className="whitespace-pre-line">
              {index + 1}. {item.prompt}
            </span>
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {item.options.map((option) => {
              const isCorrect = item.correct.includes(option.id);
              const wasGiven = item.given.includes(option.id);
              return (
                <li
                  key={option.id}
                  className={cn(
                    "rounded-md border px-3 py-1.5",
                    isCorrect ? "border-success/40 bg-success/10" : wasGiven ? "border-danger/40 bg-danger/10" : "border-border",
                  )}
                >
                  {option.text}
                  {isCorrect ? <span className="ml-2 text-xs font-medium text-success">Correcta</span> : null}
                  {wasGiven && !isCorrect ? <span className="ml-2 text-xs font-medium text-danger">Tu respuesta</span> : null}
                  {wasGiven && isCorrect ? <span className="ml-2 text-xs text-muted-foreground">(la elegiste)</span> : null}
                </li>
              );
            })}
          </ul>
          {item.explanation ? (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{item.explanation}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
