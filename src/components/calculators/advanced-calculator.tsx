"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADVANCED_CALCULATORS,
  initialValues,
  type AdvancedCalculatorId,
  type AdvancedField,
  type AdvancedTone,
} from "@/lib/calculators/advanced";
import { parseDay } from "@/lib/calculators/traction";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<AdvancedTone, string> = {
  green: "bg-success/15 text-success",
  amber: "bg-warning/15 text-warning",
  red: "bg-danger/15 text-danger",
  gray: "bg-muted text-muted-foreground",
};
const BAR_CLASS: Record<AdvancedTone, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-danger",
  gray: "bg-muted-foreground",
};

const noopSubscribe = () => () => {};
/** El día de hoy (en la zona del dispositivo) como "AAAA-MM-DD"; `null` en el servidor para no hidratar con otra fecha. */
function useTodayKey(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    },
    () => null,
  );
}

/** Calculadoras con fechas, selectores y semáforo (máquina de tracción ADSUR). */
export function AdvancedCalculator({ id }: { id: AdvancedCalculatorId }) {
  const definition = ADVANCED_CALCULATORS[id];
  const todayKey = useTodayKey();
  const today = todayKey ? parseDay(todayKey) : null;

  return (
    <section
      aria-label={`Calculadora: ${definition.title}`}
      className="not-prose my-8 overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border bg-muted px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Calculadora</p>
        <h3 className="text-base font-semibold">{definition.title}</h3>
      </header>
      {today ? (
        <Form id={id} today={today} />
      ) : (
        <div className="p-4 text-sm text-muted-foreground" aria-busy>
          Cargando la calculadora…
        </div>
      )}
    </section>
  );
}

function Form({ id, today }: { id: AdvancedCalculatorId; today: Date }) {
  const definition = ADVANCED_CALCULATORS[id];
  const formId = useId();
  const [values, setValues] = useState(() => initialValues(definition, today));
  const result = useMemo(() => definition.compute(values, today), [definition, values, today]);
  const errors = result.errors ?? {};

  return (
    <>
      <div className="grid gap-6 p-4 md:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {definition.fields.map((field) => {
            const enabled = !field.enabledWhen || values[field.enabledWhen.key] === field.enabledWhen.equals;
            return (
              <FieldInput
                key={field.key}
                field={field}
                inputId={`${formId}-${field.key}`}
                value={values[field.key] ?? ""}
                disabled={!enabled}
                error={enabled ? errors[field.key] : undefined}
                onChange={(next) => setValues((prev) => ({ ...prev, [field.key]: next }))}
              />
            );
          })}
        </div>

        <div
          aria-live="polite"
          className="flex flex-col gap-3 rounded-lg border-l-4 bg-[var(--primary-soft)] p-4"
          style={{ borderLeftColor: "var(--accent)" }}
        >
          {result.errors ? (
            <p className="text-sm text-muted-foreground">Revisá los valores marcados para ver el resultado.</p>
          ) : (
            <>
              {result.headline ? (
                <div>
                  <p className="text-xs text-muted-foreground">{result.headline.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">{result.headline.value}</p>
                </div>
              ) : null}
              {result.verdict ? (
                <span className={cn("inline-block w-fit rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[result.verdict.tone])}>
                  {result.verdict.label}
                </span>
              ) : null}
              {result.bar ? <Bar bar={result.bar} /> : null}
              {result.rows ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {result.rows.map((row) => (
                    <li key={row.label} className="list-none rounded-lg bg-card p-3">
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="mt-1">
                        <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[row.tone])}>{row.value}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.details?.length ? (
                <dl className="flex flex-col gap-1.5 text-sm">
                  {result.details.map((detail) => (
                    <div key={detail.label} className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">{detail.label}</dt>
                      <dd className="font-medium tabular-nums">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </>
          )}
        </div>
      </div>
      {result.note ? <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{result.note}</p> : null}
    </>
  );
}

function Bar({ bar }: { bar: NonNullable<ReturnType<(typeof ADVANCED_CALCULATORS)[AdvancedCalculatorId]["compute"]>["bar"]> }) {
  return (
    <div>
      <div className="relative pt-5">
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-xs font-medium tabular-nums"
          style={{ left: `${bar.pct}%` }}
        >
          {bar.markLabel}
        </span>
        <div
          role="img"
          aria-label={`${bar.markLabel}, ${bar.startLabel} a ${bar.endLabel}`}
          className="relative h-3 overflow-hidden rounded-full bg-muted"
        >
          <div className={cn("h-full rounded-full", BAR_CLASS[bar.tone])} style={{ width: `${bar.pct}%` }} />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{bar.startLabel}</span>
        <span>{bar.endLabel}</span>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  inputId,
  value,
  disabled,
  error,
  onChange,
}: {
  field: AdvancedField;
  inputId: string;
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const describedBy = [error ? `${inputId}-error` : null, field.help ? `${inputId}-help` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} className="block text-xs leading-snug">
        <span>
          {field.label}
          {field.kind === "number" && field.unit ? <span className="text-muted-foreground"> ({field.unit})</span> : null}
        </span>
      </Label>
      {field.kind === "select" ? (
        <select
          id={inputId}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={inputId}
          type={field.kind === "date" ? "date" : "number"}
          inputMode={field.kind === "number" ? "decimal" : undefined}
          step={field.kind === "number" ? (field.step ?? "any") : undefined}
          min={field.kind === "number" ? field.min : undefined}
          max={field.kind === "number" ? field.max : undefined}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.help ? (
        <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
          {field.help}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
