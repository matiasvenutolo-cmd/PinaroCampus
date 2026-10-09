// Calculadoras del curso de la máquina de tracción ADSUR (curso.md, parte B).
// Funciones puras: las fechas son días calendario en UTC (medianoche), así los
// resultados no dependen de la zona horaria de quien las calcula.

/** Frecuencias del manual de mantenimiento ADSUR, versión 01.2014. */
export const TRACTION_RULES = {
  firstOilMonths: 12,
  firstOilHours: 4000,
  greaseMonths: 6,
  backlashMonths: 12,
  backlashHours: 3000,
  soonDays: 30,
} as const;

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.4375;

export type MaintenanceStatus = "ok" | "soon" | "overdue";

/** "2026-10-09" → medianoche UTC; `null` si no es una fecha real. */
export function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Suma meses calendario; si el día no existe en el mes destino queda en su último día. */
export function addMonths(date: Date, months: number): Date {
  const total = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

const earliest = (a: Date, b: Date | null) => (b && b.getTime() < a.getTime() ? b : a);

export interface ScheduleInput {
  today: Date;
  serviceStart: Date;
  hoursTotal: number;
  hoursPerMonth: number;
  /** ¿Ya se hizo el primer cambio de aceite? */
  firstOilDone: boolean;
  lastOilChange: Date | null;
  oilIntervalMonths: 18 | 24;
  lastGreasing: Date;
  /** `null` = nunca: se cuenta desde la puesta en servicio. */
  lastBacklashCheck: Date | null;
}

export interface ScheduleRow {
  id: "oil" | "grease" | "backlash";
  task: string;
  dueDate: Date;
  /** Negativo = vencido. */
  daysLeft: number;
  status: MaintenanceStatus;
  /** Qué criterio fija la fecha ("por plazo", "por horas"). */
  basis: string;
}

function statusOf(daysLeft: number): MaintenanceStatus {
  if (daysLeft < 0) return "overdue";
  return daysLeft < TRACTION_RULES.soonDays ? "soon" : "ok";
}

function row(id: ScheduleRow["id"], task: string, dueDate: Date, today: Date, basis: string): ScheduleRow {
  const daysLeft = daysBetween(today, dueDate);
  return { id, task, dueDate, daysLeft, status: statusOf(daysLeft), basis };
}

/** Fecha en que se llega a `limit` horas, a `hoursPerMonth` por mes (`null` si no corre el reloj). */
function dateAtHours(today: Date, hoursNow: number, limit: number, hoursPerMonth: number): Date | null {
  if (hoursPerMonth <= 0) return null;
  return addDays(today, Math.round(((limit - hoursNow) / hoursPerMonth) * AVG_MONTH_DAYS));
}

/**
 * Próximos vencimientos de la máquina de tracción:
 * - Primer cambio de aceite: lo primero entre 12 meses desde la puesta en servicio y 4.000 h.
 * - Cambios siguientes: último cambio + 18 o 24 meses.
 * - Engrase del tercer apoyo: último engrase + 6 meses.
 * - Control de juego sinfín-corona: lo primero entre 12 meses desde el último control (o la
 *   puesta en servicio) y 3.000 h desde el último control (sin control previo, desde 0 h).
 */
export function tractionMaintenanceSchedule(input: ScheduleInput): ScheduleRow[] {
  const { today } = input;

  let oil: ScheduleRow;
  if (input.firstOilDone && input.lastOilChange) {
    oil = row(
      "oil",
      "Cambio de aceite del reductor",
      addMonths(input.lastOilChange, input.oilIntervalMonths),
      today,
      `último cambio + ${input.oilIntervalMonths} meses`,
    );
  } else {
    const byTime = addMonths(input.serviceStart, TRACTION_RULES.firstOilMonths);
    const byHours = dateAtHours(today, input.hoursTotal, TRACTION_RULES.firstOilHours, input.hoursPerMonth);
    const due = earliest(byTime, byHours);
    oil = row(
      "oil",
      "Primer cambio de aceite del reductor",
      due,
      today,
      due === byTime ? "12 meses desde la puesta en servicio" : "4.000 horas de servicio",
    );
  }

  const grease = row(
    "grease",
    "Engrase del tercer apoyo",
    addMonths(input.lastGreasing, TRACTION_RULES.greaseMonths),
    today,
    "último engrase + 6 meses",
  );

  const byTime = addMonths(input.lastBacklashCheck ?? input.serviceStart, TRACTION_RULES.backlashMonths);
  const byHours = input.lastBacklashCheck
    ? input.hoursPerMonth > 0
      ? addDays(
          input.lastBacklashCheck,
          Math.round((TRACTION_RULES.backlashHours / input.hoursPerMonth) * AVG_MONTH_DAYS),
        )
      : null
    : dateAtHours(today, input.hoursTotal, TRACTION_RULES.backlashHours, input.hoursPerMonth);
  const backlashDue = earliest(byTime, byHours);
  const backlash = row(
    "backlash",
    "Control de juego sinfín-corona",
    backlashDue,
    today,
    backlashDue === byTime
      ? `12 meses desde ${input.lastBacklashCheck ? "el último control" : "la puesta en servicio"}`
      : "3.000 horas de servicio entre controles",
  );

  return [oil, grease, backlash];
}

// ---- Juego entre sinfín y corona ----

export const BACKLASH_MODELS = {
  "M-137": { newMm: 3.5, wornMm: 38.5 },
  "MV-137 RHINO": { newMm: 3.5, wornMm: 38.5 },
  "M-194": { newMm: 4.4, wornMm: 48.4 },
  "M-202": { newMm: 4.8, wornMm: 52.8 },
} as const;

export type BacklashModel = keyof typeof BACKLASH_MODELS;

/** Por encima de este % del rango conviene acortar la frecuencia de control (orientativo: no figura en el manual). */
export const BACKLASH_WARN_PCT = 70;

export type BacklashState = "green" | "amber" | "red" | "recheck";

export function wormGearBacklash(input: { model: BacklashModel; distanceMm: number }) {
  const { newMm, wornMm } = BACKLASH_MODELS[input.model];
  const pct = ((input.distanceMm - newMm) / (wornMm - newMm)) * 100;
  const state: BacklashState =
    input.distanceMm < newMm ? "recheck" : pct > 100 ? "red" : pct >= BACKLASH_WARN_PCT ? "amber" : "green";
  return { newMm, wornMm, pct, state, barPct: Math.min(Math.max(pct, 0), 100) };
}
