"use client";

import { useState, useTransition } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { toggleChecklistItem } from "@/lib/courses/actions";

export function Checklist({
  id,
  items,
  courseSlug,
  lessonKey,
  initialChecked,
  readOnly,
}: {
  id: string;
  items: string[];
  courseSlug: string;
  lessonKey: string;
  initialChecked: number[];
  readOnly: boolean;
}) {
  const [checked, setChecked] = useState(() => new Set(initialChecked));
  const [, startTransition] = useTransition();

  function toggle(index: number, value: boolean) {
    const next = new Set(checked);
    if (value) next.add(index);
    else next.delete(index);
    setChecked(next);
    if (readOnly) return;
    startTransition(async () => {
      const result = await toggleChecklistItem({ courseSlug, lessonKey, checklistId: id, index, checked: value });
      if (!result.ok) setChecked(checked); // vuelve atrás si no se pudo guardar
    });
  }

  return (
    <ul className="my-6 flex list-none flex-col gap-2 rounded-xl border border-border bg-card p-4">
      {items.map((item, index) => {
        const inputId = `${id}-${index}`;
        return (
          <li key={index} className="flex items-start gap-3">
            <Checkbox
              id={inputId}
              checked={checked.has(index)}
              onCheckedChange={(value) => toggle(index, value === true)}
              className="mt-1"
            />
            <label htmlFor={inputId} className={checked.has(index) ? "text-muted-foreground line-through" : ""}>
              {item}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
