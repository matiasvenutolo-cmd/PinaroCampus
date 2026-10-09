import { formatNumber, formatPesos } from "@/lib/format";
import type { CalculatorId } from "@/lib/courses/schema";

import type { AdvancedCalculatorId } from "./advanced";

import {
  airLeaks,
  capacitorSizing,
  energyCost,
  ledSavings,
  payback,
  vfdSavings,
  type PaybackTone,
} from "./compute";

export interface CalcField {
  key: string;
  label: string;
  unit?: string;
  defaultValue: number | null;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
}

/** Valores ya parseados; solo los campos `optional` pueden venir en `null`. */
export type CalcValues = Record<string, number | null>;

export interface CalcResult {
  headline: { label: string; value: string };
  details: { label: string; value: string }[];
  verdict?: { tone: PaybackTone; label: string };
  note?: string;
}

/** Calculadoras de solo números; las de fechas y selectores están en `advanced.ts`. */
export type SimpleCalculatorId = Exclude<CalculatorId, AdvancedCalculatorId>;

export interface CalcDefinition {
  id: SimpleCalculatorId;
  title: string;
  fields: CalcField[];
  compute(values: CalcValues): CalcResult;
}

const PRICE_FIELD: CalcField = {
  key: "pricePerKwh",
  label: "Precio de la energía",
  unit: "$/kWh",
  defaultValue: 150,
  min: 0,
  step: 1,
};

const kwh = (value: number) => `${formatNumber(value)} kWh`;

function formatPaybackTime(months: number): string {
  if (months < 1) return "menos de 1 mes";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "mes" : "meses"}`);
  return parts.join(" y ");
}

const VERDICT_LABEL: Record<PaybackTone, string> = {
  green: "Hacelo ya",
  amber: "Muy conveniente",
  gray: "Evaluá financiamiento",
};

export const CALCULATORS: Record<SimpleCalculatorId, CalcDefinition> = {
  "energy-cost": {
    id: "energy-cost",
    title: "Costo anual de un equipo",
    fields: [
      { key: "kw", label: "Potencia", unit: "kW", defaultValue: 15, min: 0, step: 0.1 },
      { key: "loadPct", label: "Factor de carga", unit: "%", defaultValue: 100, min: 0, max: 100, step: 1 },
      { key: "hoursPerDay", label: "Horas por día", unit: "h", defaultValue: 16, min: 0, max: 24, step: 0.5 },
      { key: "daysPerYear", label: "Días por año", unit: "días", defaultValue: 264, min: 0, max: 366, step: 1 },
      PRICE_FIELD,
      {
        key: "plantMonthlyKwh",
        label: "Consumo mensual de la planta (opcional)",
        unit: "kWh",
        defaultValue: null,
        min: 0,
        step: 100,
        optional: true,
      },
    ],
    compute(v) {
      const r = energyCost({
        kw: v.kw!,
        loadPct: v.loadPct!,
        hoursPerDay: v.hoursPerDay!,
        daysPerYear: v.daysPerYear!,
        pricePerKwh: v.pricePerKwh!,
        plantMonthlyKwh: v.plantMonthlyKwh,
      });
      return {
        headline: { label: "Costo anual del equipo", value: formatPesos(r.costYear) },
        details: [
          { label: "Consumo anual", value: kwh(r.kwhYear) },
          ...(r.shareOfPlantPct !== null
            ? [
                {
                  label: "Peso en tu factura",
                  value: `Equivale al ${formatNumber(r.shareOfPlantPct, 1)}% de una factura de ${kwh(v.plantMonthlyKwh!)}/mes`,
                },
              ]
            : []),
        ],
      };
    },
  },

  "vfd-savings": {
    id: "vfd-savings",
    title: "Ahorro con variador de velocidad",
    fields: [
      { key: "kwToday", label: "Potencia absorbida hoy", unit: "kW", defaultValue: 15, min: 0, step: 0.1 },
      { key: "hoursPerYear", label: "Horas por año", unit: "h", defaultValue: 4224, min: 0, max: 8784, step: 1 },
      { key: "speedReductionPct", label: "Reducción de velocidad", unit: "%", defaultValue: 20, min: 0, max: 90, step: 1 },
      { key: "drivEfficiencyPct", label: "Eficiencia del variador", unit: "%", defaultValue: 97, min: 50, max: 100, step: 0.5 },
      PRICE_FIELD,
    ],
    compute(v) {
      const r = vfdSavings({
        kwToday: v.kwToday!,
        hoursPerYear: v.hoursPerYear!,
        speedReductionPct: v.speedReductionPct!,
        drivEfficiencyPct: v.drivEfficiencyPct!,
        pricePerKwh: v.pricePerKwh!,
      });
      return {
        headline: { label: "Ahorro anual", value: formatPesos(r.savedCostYear) },
        details: [
          { label: "Potencia con variador", value: `${formatNumber(r.kwWithVfd, 1)} kW` },
          { label: "Ahorro de potencia", value: `${formatNumber(r.savedKw, 1)} kW` },
          { label: "Energía ahorrada por año", value: kwh(r.savedKwhYear) },
        ],
        note: "Aplica a bombas y ventiladores centrífugos (ley cúbica). En cargas de torque constante el ahorro es mucho menor.",
      };
    },
  },

  "air-leaks": {
    id: "air-leaks",
    title: "Costo de las fugas de aire comprimido",
    fields: [
      { key: "mm1", label: "Fugas de 1 mm", unit: "u.", defaultValue: 10, min: 0, step: 1 },
      { key: "mm3", label: "Fugas de 3 mm", unit: "u.", defaultValue: 2, min: 0, step: 1 },
      { key: "mm5", label: "Fugas de 5 mm", unit: "u.", defaultValue: 0, min: 0, step: 1 },
      { key: "mm10", label: "Fugas de 10 mm", unit: "u.", defaultValue: 0, min: 0, step: 1 },
      { key: "hoursPerYear", label: "Horas por año con el compresor en marcha", unit: "h", defaultValue: 4224, min: 0, max: 8784, step: 1 },
      PRICE_FIELD,
    ],
    compute(v) {
      const r = airLeaks({
        mm1: v.mm1!,
        mm3: v.mm3!,
        mm5: v.mm5!,
        mm10: v.mm10!,
        hoursPerYear: v.hoursPerYear!,
        pricePerKwh: v.pricePerKwh!,
      });
      return {
        headline: { label: "Costo anual de las fugas", value: formatPesos(r.costYear) },
        details: [
          { label: "Potencia de compresor desperdiciada", value: `${formatNumber(r.lostKw, 1)} kW` },
          { label: "Energía desperdiciada por año", value: kwh(r.lostKwhYear) },
        ],
        note: "Valores de referencia aproximados a ~6 bar: 1 mm ≈ 0,3 kW · 3 mm ≈ 3,1 kW · 5 mm ≈ 8,3 kW · 10 mm ≈ 33 kW.",
      };
    },
  },

  "capacitor-sizing": {
    id: "capacitor-sizing",
    title: "Banco de capacitores para el factor de potencia",
    fields: [
      { key: "kw", label: "Potencia activa", unit: "kW", defaultValue: 140, min: 0, step: 1 },
      { key: "cosNow", label: "cos φ actual", defaultValue: 0.88, min: 0.3, max: 1, step: 0.01 },
      { key: "cosTarget", label: "cos φ objetivo", defaultValue: 0.96, min: 0.3, max: 1, step: 0.01 },
    ],
    compute(v) {
      const r = capacitorSizing({ kw: v.kw!, cosNow: v.cosNow!, cosTarget: v.cosTarget! });
      return {
        headline: { label: "Potencia reactiva a compensar", value: `${formatNumber(r.kvar, 1)} kvar` },
        details: [
          {
            label: "Escalón comercial sugerido",
            value: r.commercialKvar === 0 ? "No hace falta compensar" : `${formatNumber(r.commercialKvar)} kvar`,
          },
        ],
        note: "El dimensionamiento final lo hace un profesional con mediciones de un analizador de redes.",
      };
    },
  },

  payback: {
    id: "payback",
    title: "Recupero de la inversión",
    fields: [
      { key: "investment", label: "Inversión", unit: "$", defaultValue: 4500000, min: 0, step: 10000 },
      { key: "savingPerYear", label: "Ahorro anual", unit: "$", defaultValue: 4487000, min: 0, step: 10000 },
      { key: "lifeYears", label: "Vida útil", unit: "años", defaultValue: 10, min: 1, max: 50, step: 1 },
    ],
    compute(v) {
      const r = payback({
        investment: v.investment!,
        savingPerYear: v.savingPerYear!,
        lifeYears: v.lifeYears!,
      });
      return {
        headline: {
          label: "Recupero de la inversión",
          value: r.months === null ? "No se recupera" : formatPaybackTime(r.months),
        },
        details: [{ label: `Ahorro neto en ${v.lifeYears} años`, value: formatPesos(r.netSaving) }],
        verdict: { tone: r.tone, label: VERDICT_LABEL[r.tone] },
      };
    },
  },

  "led-savings": {
    id: "led-savings",
    title: "Recambio a LED",
    fields: [
      { key: "count", label: "Cantidad de luminarias", unit: "u.", defaultValue: 120, min: 0, step: 1 },
      { key: "wattsNow", label: "Potencia actual por luminaria (con equipo auxiliar)", unit: "W", defaultValue: 80, min: 0, step: 1 },
      { key: "wattsLed", label: "Potencia LED equivalente", unit: "W", defaultValue: 36, min: 0, step: 1 },
      { key: "hoursPerYear", label: "Horas por año", unit: "h", defaultValue: 4224, min: 0, max: 8784, step: 1 },
      PRICE_FIELD,
    ],
    compute(v) {
      const r = ledSavings({
        count: v.count!,
        wattsNow: v.wattsNow!,
        wattsLed: v.wattsLed!,
        hoursPerYear: v.hoursPerYear!,
        pricePerKwh: v.pricePerKwh!,
      });
      return {
        headline: { label: "Ahorro anual", value: formatPesos(r.savedCostYear) },
        details: [{ label: "Energía ahorrada por año", value: kwh(r.savedKwhYear) }],
      };
    },
  },
};
