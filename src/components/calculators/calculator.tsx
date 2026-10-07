"use client";

import { useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CALCULATORS, type CalcField, type CalcValues } from "@/lib/calculators/definitions";
import type { CalculatorId } from "@/lib/courses/schema";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  green: "bg-success/15 text-success",
  amber: "bg-warning/15 text-warning",
  gray: "bg-muted text-muted-foreground",
} as const;

function parseField(field: CalcField, raw: string): { value: number | null; error?: string } {
  const text = raw.trim().replace(",", ".");
  if (text === "") {
    return field.optional ? { value: null } : { value: null, error: "Completá este valor" };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { value: null, error: "Ingresá un número" };
  if (field.min !== undefined && value < field.min) return { value, error: `Mínimo ${field.min}` };
  if (field.max !== undefined && value > field.max) return { value, error: `Máximo ${field.max}` };
  return { value };
}

export function Calculator({ id }: { id: CalculatorId }) {
  const definition = CALCULATORS[id];
  const formId = useId();
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      definition.fields.map((f) => [f.key, f.defaultValue === null ? "" : String(f.defaultValue)]),
    ),
  );

  const { values, errors } = useMemo(() => {
    const values: CalcValues = {};
    const errors: Record<string, string> = {};
    for (const field of definition.fields) {
      const parsed = parseField(field, raw[field.key] ?? "");
      values[field.key] = parsed.value;
      if (parsed.error) errors[field.key] = parsed.error;
    }
    return { values, errors };
  }, [definition, raw]);

  const hasErrors = Object.keys(errors).length > 0;
  const result = hasErrors ? null : definition.compute(values);

  return (
    <section
      aria-label={`Calculadora: ${definition.title}`}
      className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border bg-muted px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Calculadora
        </p>
        <h3 className="text-base font-semibold">{definition.title}</h3>
      </header>

      <div className="grid gap-6 p-4 md:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {definition.fields.map((field) => {
            const inputId = `${formId}-${field.key}`;
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={inputId} className="block text-xs leading-snug">
                  <span>
                    {field.label}
                    {field.unit ? <span className="text-muted-foreground"> ({field.unit})</span> : null}
                  </span>
                </Label>
                <Input
                  id={inputId}
                  type="number"
                  inputMode="decimal"
                  step={field.step ?? "any"}
                  min={field.min}
                  max={field.max}
                  value={raw[field.key]}
                  aria-invalid={errors[field.key] ? true : undefined}
                  aria-describedby={errors[field.key] ? `${inputId}-error` : undefined}
                  onChange={(e) => setRaw((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
                {errors[field.key] ? (
                  <p id={`${inputId}-error`} className="text-xs text-danger">
                    {errors[field.key]}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          aria-live="polite"
          className="flex flex-col gap-3 rounded-lg border-l-4 bg-[var(--primary-soft)] p-4"
          style={{ borderLeftColor: "var(--accent)" }}
        >
          {result ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">{result.headline.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{result.headline.value}</p>
                {result.verdict ? (
                  <span
                    className={cn(
                      "mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      TONE_CLASS[result.verdict.tone],
                    )}
                  >
                    {result.verdict.label}
                  </span>
                ) : null}
              </div>
              <dl className="flex flex-col gap-1.5 text-sm">
                {result.details.map((detail) => (
                  <div key={detail.label} className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">{detail.label}</dt>
                    <dd className="font-medium tabular-nums">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              {result.note ? <p className="text-xs text-muted-foreground">{result.note}</p> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Revisá los valores marcados para ver el resultado.
            </p>
          )}
        </div>
      </div>

      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Resultado estimado; usá los datos de tu planta y tu factura.
      </p>
    </section>
  );
}
