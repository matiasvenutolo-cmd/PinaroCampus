import { formatNumber } from "@/lib/format";

import {
  BACKLASH_MODELS,
  BACKLASH_WARN_PCT,
  addMonths,
  formatDay,
  parseDay,
  tractionMaintenanceSchedule,
  wormGearBacklash,
  type BacklashModel,
  type MaintenanceStatus,
} from "./traction";

// Calculadoras con fechas, selectores y resultados con semáforo (curso de la
// máquina de tracción ADSUR). Las de números solos viven en `definitions.ts`.

export type AdvancedCalculatorId = "traction-maintenance-schedule" | "worm-gear-backlash";

interface BaseField {
  key: string;
  label: string;
  help?: string;
  /** El campo solo se habilita si otro tiene este valor. */
  enabledWhen?: { key: string; equals: string };
}
export interface AdvancedNumberField extends BaseField {
  kind: "number";
  unit?: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}
export interface AdvancedDateField extends BaseField {
  kind: "date";
  /** Meses respecto de hoy (-14 = hoy menos 14 meses); `null` = vacío. */
  defaultOffsetMonths: number | null;
  defaultValue?: undefined;
}
export interface AdvancedSelectField extends BaseField {
  kind: "select";
  options: { value: string; label: string }[];
  defaultValue: string;
}
export type AdvancedField = AdvancedNumberField | AdvancedDateField | AdvancedSelectField;

export type AdvancedTone = "green" | "amber" | "red" | "gray";

export interface AdvancedResult {
  /** Errores por campo: si hay alguno, no hay resultado. */
  errors?: Record<string, string>;
  headline?: { label: string; value: string };
  verdict?: { tone: AdvancedTone; label: string };
  rows?: { label: string; value: string; detail: string; tone: AdvancedTone }[];
  /** Barra "de A a B" con una marca (0 a 100). */
  bar?: { pct: number; tone: AdvancedTone; startLabel: string; endLabel: string; markLabel: string };
  details?: { label: string; value: string }[];
  note?: string;
}

export interface AdvancedDefinition {
  id: AdvancedCalculatorId;
  title: string;
  fields: AdvancedField[];
  /** `values` son los textos tal cual están en los campos; `today` es el día de hoy (UTC, sin hora). */
  compute(values: Record<string, string>, today: Date): AdvancedResult;
}

export function defaultDateValue(field: AdvancedDateField, today: Date): string {
  return field.defaultOffsetMonths === null ? "" : formatDay(addMonths(today, field.defaultOffsetMonths));
}

/** Valores iniciales de todos los campos para un día dado. */
export function initialValues(definition: AdvancedDefinition, today: Date): Record<string, string> {
  return Object.fromEntries(
    definition.fields.map((f) => [f.key, f.kind === "date" ? defaultDateValue(f, today) : String(f.defaultValue)]),
  );
}

function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const longDate = (date: Date) =>
  `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const STATUS_TONE: Record<MaintenanceStatus, AdvancedTone> = { ok: "green", soon: "amber", overdue: "red" };

function statusLabel(status: MaintenanceStatus, daysLeft: number): string {
  if (status === "overdue") return `Vencido hace ${plural(-daysLeft, "día", "días")}`;
  if (status === "soon") return daysLeft === 0 ? "Vence hoy" : `Vence en ${plural(daysLeft, "día", "días")}`;
  return "Al día";
}

const schedule: AdvancedDefinition = {
  id: "traction-maintenance-schedule",
  title: "Próximos vencimientos de mantenimiento",
  fields: [
    { kind: "date", key: "serviceStart", label: "Fecha de puesta en servicio", defaultOffsetMonths: -14 },
    { kind: "number", key: "hoursTotal", label: "Horas de servicio acumuladas", unit: "h", defaultValue: 3600, min: 0, step: 10 },
    { kind: "number", key: "hoursPerMonth", label: "Horas de servicio por mes", unit: "h/mes", defaultValue: 260, min: 0, step: 5 },
    {
      kind: "select",
      key: "firstOilDone",
      label: "¿Ya se hizo el primer cambio de aceite?",
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Sí" },
      ],
      defaultValue: "no",
    },
    {
      kind: "date",
      key: "lastOilChange",
      label: "Fecha del último cambio de aceite",
      defaultOffsetMonths: null,
      enabledWhen: { key: "firstOilDone", equals: "yes" },
    },
    {
      kind: "select",
      key: "oilIntervalMonths",
      label: "Intervalo entre cambios de aceite",
      options: [
        { value: "18", label: "18 meses" },
        { value: "24", label: "24 meses" },
      ],
      defaultValue: "24",
      help: "18 meses en servicio exigente.",
    },
    { kind: "date", key: "lastGreasing", label: "Fecha del último engrase del tercer apoyo", defaultOffsetMonths: -7 },
    {
      kind: "date",
      key: "lastBacklashCheck",
      label: "Fecha del último control de juego sinfín-corona",
      defaultOffsetMonths: null,
      help: "Vacío = nunca se hizo: se cuenta desde la puesta en servicio.",
    },
  ],
  compute(values, today): AdvancedResult {
    const errors: Record<string, string> = {};
    const date = (key: string, { required, past }: { required: boolean; past: boolean }) => {
      const text = (values[key] ?? "").trim();
      if (!text) {
        if (required) errors[key] = "Completá esta fecha";
        return null;
      }
      const parsed = parseDay(text);
      if (!parsed) errors[key] = "Fecha inválida";
      else if (past && parsed.getTime() > today.getTime()) errors[key] = "No puede ser una fecha futura";
      return parsed;
    };
    const count = (key: string) => {
      const n = parseNumber(values[key] ?? "");
      if (n === null || n < 0) errors[key] = "Ingresá un número mayor o igual a 0";
      return n ?? 0;
    };

    const serviceStart = date("serviceStart", { required: true, past: true });
    const firstOilDone = values.firstOilDone === "yes";
    const lastOilChange = firstOilDone ? date("lastOilChange", { required: true, past: true }) : null;
    const lastGreasing = date("lastGreasing", { required: true, past: true });
    const lastBacklashCheck = date("lastBacklashCheck", { required: false, past: true });
    const hoursTotal = count("hoursTotal");
    const hoursPerMonth = count("hoursPerMonth");
    const oilIntervalMonths = values.oilIntervalMonths === "18" ? 18 : 24;
    if (Object.keys(errors).length > 0 || !serviceStart || !lastGreasing) return { errors };

    const rows = tractionMaintenanceSchedule({
      today,
      serviceStart,
      hoursTotal,
      hoursPerMonth,
      firstOilDone,
      lastOilChange,
      oilIntervalMonths,
      lastGreasing,
      lastBacklashCheck,
    });
    return {
      rows: rows.map((r) => ({
        label: r.task,
        value: statusLabel(r.status, r.daysLeft),
        detail: `${longDate(r.dueDate)} · ${r.basis}`,
        tone: STATUS_TONE[r.status],
      })),
      note: "Frecuencias según el manual de mantenimiento ADSUR, versión 01.2014",
    };
  },
};

const BACKLASH_VERDICT = {
  green: { tone: "green", label: "Dentro de tolerancia" },
  amber: { tone: "amber", label: "Dentro de tolerancia: acortá la frecuencia de control" },
  red: { tone: "red", label: "Fuera de tolerancia: consultá al servicio técnico del fabricante" },
  recheck: { tone: "gray", label: "Revisá la medición: el valor es menor que el de una máquina nueva" },
} as const satisfies Record<string, { tone: AdvancedTone; label: string }>;

const backlash: AdvancedDefinition = {
  id: "worm-gear-backlash",
  title: "Juego entre sinfín y corona",
  fields: [
    {
      kind: "select",
      key: "model",
      label: "Modelo de máquina",
      options: (Object.keys(BACKLASH_MODELS) as BacklashModel[]).map((m) => ({ value: m, label: m })),
      defaultValue: "M-194",
    },
    { kind: "number", key: "distanceMm", label: "Distancia A medida entre las dos marcas", unit: "mm", defaultValue: 21, min: 0, step: 0.1 },
  ],
  compute(values): AdvancedResult {
    const model = values.model as BacklashModel;
    if (!(model in BACKLASH_MODELS)) return { errors: { model: "Elegí un modelo" } };
    const distance = parseNumber(values.distanceMm ?? "");
    if (distance === null || distance <= 0) return { errors: { distanceMm: "Ingresá la distancia A en mm (mayor a 0)" } };

    const r = wormGearBacklash({ model, distanceMm: distance });
    const verdict = BACKLASH_VERDICT[r.state];
    return {
      headline: { label: "Porción del rango ya consumida", value: `${formatNumber(r.pct, 1)}%` },
      verdict,
      bar: {
        pct: r.barPct,
        tone: verdict.tone,
        startLabel: `Nueva · ${formatNumber(r.newMm, 1)} mm`,
        endLabel: `Desgastada · ${formatNumber(r.wornMm, 1)} mm`,
        markLabel: `A = ${formatNumber(distance, 1)} mm`,
      },
      details: [
        { label: "Modelo", value: model },
        { label: "Rango admisible del manual", value: `${formatNumber(r.newMm, 1)} a ${formatNumber(r.wornMm, 1)} mm` },
      ],
      note: `El umbral de ${BACKLASH_WARN_PCT}% es orientativo y no figura en el manual del fabricante.`,
    };
  },
};

export const ADVANCED_CALCULATORS: Record<AdvancedCalculatorId, AdvancedDefinition> = {
  "traction-maintenance-schedule": schedule,
  "worm-gear-backlash": backlash,
};

export function isAdvancedCalculator(id: string): id is AdvancedCalculatorId {
  return id in ADVANCED_CALCULATORS;
}
