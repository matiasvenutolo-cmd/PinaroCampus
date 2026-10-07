// Fórmulas de las calculadoras (docs/05-formato-de-cursos.md, "Calculadoras").
// Funciones puras: la UI las usa y tests/unit/calculators.test.ts las prueba.

export function energyCost(input: {
  kw: number;
  loadPct: number;
  hoursPerDay: number;
  daysPerYear: number;
  pricePerKwh: number;
  plantMonthlyKwh?: number | null;
}) {
  const kwhYear = input.kw * (input.loadPct / 100) * input.hoursPerDay * input.daysPerYear;
  const costYear = kwhYear * input.pricePerKwh;
  const shareOfPlantPct =
    input.plantMonthlyKwh && input.plantMonthlyKwh > 0
      ? (kwhYear / 12 / input.plantMonthlyKwh) * 100
      : null;
  return { kwhYear, costYear, shareOfPlantPct };
}

/** Ley cúbica: solo para bombas y ventiladores centrífugos. */
export function vfdSavings(input: {
  kwToday: number;
  hoursPerYear: number;
  speedReductionPct: number;
  drivEfficiencyPct: number;
  pricePerKwh: number;
}) {
  const factor = (1 - input.speedReductionPct / 100) ** 3;
  const kwWithVfd = (input.kwToday * factor) / (input.drivEfficiencyPct / 100);
  const savedKw = input.kwToday - kwWithVfd;
  const savedKwhYear = savedKw * input.hoursPerYear;
  return { factor, kwWithVfd, savedKw, savedKwhYear, savedCostYear: savedKwhYear * input.pricePerKwh };
}

/** kW de compresor que desperdicia una fuga, a ~6 bar (referencia aproximada). */
export const AIR_LEAK_KW = { mm1: 0.3, mm3: 3.1, mm5: 8.3, mm10: 33 } as const;

export function airLeaks(input: {
  mm1: number;
  mm3: number;
  mm5: number;
  mm10: number;
  hoursPerYear: number;
  pricePerKwh: number;
}) {
  const lostKw =
    input.mm1 * AIR_LEAK_KW.mm1 +
    input.mm3 * AIR_LEAK_KW.mm3 +
    input.mm5 * AIR_LEAK_KW.mm5 +
    input.mm10 * AIR_LEAK_KW.mm10;
  const lostKwhYear = lostKw * input.hoursPerYear;
  return { lostKw, lostKwhYear, costYear: lostKwhYear * input.pricePerKwh };
}

const STEP_KVAR = 5;

export function capacitorSizing(input: { kw: number; cosNow: number; cosTarget: number }) {
  const tan = (cos: number) => Math.tan(Math.acos(cos));
  const kvar = Math.max(0, input.kw * (tan(input.cosNow) - tan(input.cosTarget)));
  const commercialKvar = kvar === 0 ? 0 : Math.ceil(kvar / STEP_KVAR) * STEP_KVAR;
  return { kvar, commercialKvar };
}

export type PaybackTone = "green" | "amber" | "gray";

export function payback(input: { investment: number; savingPerYear: number; lifeYears: number }) {
  if (input.savingPerYear <= 0) {
    return { years: null, months: null, netSaving: -input.investment, tone: "gray" as PaybackTone };
  }
  const years = input.investment / input.savingPerYear;
  const tone: PaybackTone = years < 1 ? "green" : years <= 3 ? "amber" : "gray";
  return {
    years,
    months: Math.round(years * 12),
    netSaving: input.savingPerYear * input.lifeYears - input.investment,
    tone,
  };
}

export function ledSavings(input: {
  count: number;
  wattsNow: number;
  wattsLed: number;
  hoursPerYear: number;
  pricePerKwh: number;
}) {
  const savedKwhYear = ((input.count * (input.wattsNow - input.wattsLed)) / 1000) * input.hoursPerYear;
  return { savedKwhYear, savedCostYear: savedKwhYear * input.pricePerKwh };
}
