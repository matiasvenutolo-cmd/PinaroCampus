import { describe, expect, it } from "vitest";

import { airLeaks, capacitorSizing, energyCost, ledSavings, payback, vfdSavings } from "@/lib/calculators/compute";
import { ADVANCED_CALCULATORS } from "@/lib/calculators/advanced";
import { CALCULATORS, type CalcValues, type SimpleCalculatorId } from "@/lib/calculators/definitions";
import { CALCULATOR_IDS } from "@/lib/courses/schema";

// Los valores por defecto son los del caso práctico del curso (docs/05).
describe("calculadoras: fórmulas con los valores por defecto", () => {
  it("energy-cost: 15 kW × 16 h × 264 días a $150/kWh", () => {
    const r = energyCost({ kw: 15, loadPct: 100, hoursPerDay: 16, daysPerYear: 264, pricePerKwh: 150 });
    expect(r.kwhYear).toBe(63360);
    expect(r.costYear).toBe(9504000);
    expect(r.shareOfPlantPct).toBeNull();
  });

  it("energy-cost: peso sobre el consumo mensual de la planta", () => {
    const r = energyCost({ kw: 15, loadPct: 100, hoursPerDay: 16, daysPerYear: 264, pricePerKwh: 150, plantMonthlyKwh: 52000 });
    expect(r.shareOfPlantPct).toBeCloseTo(10.15, 1);
  });

  it("vfd-savings: ley cúbica, ~$4,49 M por año (el ahorro que usa la calculadora de recupero)", () => {
    const r = vfdSavings({ kwToday: 15, hoursPerYear: 4224, speedReductionPct: 20, drivEfficiencyPct: 97, pricePerKwh: 150 });
    expect(r.factor).toBeCloseTo(0.512, 3);
    expect(Math.abs(r.savedCostYear - 4487000) / 4487000).toBeLessThan(0.001);
  });

  it("air-leaks: 10 fugas de 1 mm + 2 de 3 mm = 9,2 kW", () => {
    const r = airLeaks({ mm1: 10, mm3: 2, mm5: 0, mm10: 0, hoursPerYear: 4224, pricePerKwh: 150 });
    expect(r.lostKw).toBeCloseTo(9.2, 5);
    expect(r.costYear).toBeCloseTo(9.2 * 4224 * 150, 0);
  });

  it("capacitor-sizing: 140 kW de 0,88 a 0,96 → ~34,7 kvar, escalón de 35", () => {
    const r = capacitorSizing({ kw: 140, cosNow: 0.88, cosTarget: 0.96 });
    expect(r.kvar).toBeCloseTo(34.7, 1);
    expect(r.commercialKvar).toBe(35);
  });

  it("capacitor-sizing: si ya cumple el objetivo no hay que compensar", () => {
    expect(capacitorSizing({ kw: 140, cosNow: 0.97, cosTarget: 0.96 })).toEqual({ kvar: 0, commercialKvar: 0 });
  });

  it("payback: semáforo verde < 1 año, ámbar 1 a 3, gris > 3", () => {
    expect(payback({ investment: 1e6, savingPerYear: 4e6, lifeYears: 10 }).tone).toBe("green");
    expect(payback({ investment: 4.5e6, savingPerYear: 4.487e6, lifeYears: 10 }).tone).toBe("amber");
    expect(payback({ investment: 10e6, savingPerYear: 2e6, lifeYears: 10 }).tone).toBe("gray");
  });

  it("payback: sin ahorro no se recupera nunca", () => {
    const r = payback({ investment: 1e6, savingPerYear: 0, lifeYears: 10 });
    expect(r.months).toBeNull();
    expect(r.netSaving).toBe(-1e6);
  });

  it("payback: ahorro neto = ahorro × vida útil − inversión", () => {
    expect(payback({ investment: 4.5e6, savingPerYear: 4.487e6, lifeYears: 10 }).netSaving).toBeCloseTo(40370000, 0);
  });

  it("led-savings: 120 luminarias de 80 W a 36 W", () => {
    const r = ledSavings({ count: 120, wattsNow: 80, wattsLed: 36, hoursPerYear: 4224, pricePerKwh: 150 });
    expect(r.savedKwhYear).toBeCloseTo(22302.72, 1);
    expect(r.savedCostYear).toBeCloseTo(3345408, 0);
  });
});

describe("calculadoras: definiciones", () => {
  it("hay una definición por cada id permitido en las lecciones", () => {
    expect([...Object.keys(CALCULATORS), ...Object.keys(ADVANCED_CALCULATORS)].sort()).toEqual([...CALCULATOR_IDS].sort());
  });

  it.each(Object.keys(CALCULATORS) as SimpleCalculatorId[])("%s: calcula con sus valores por defecto", (id) => {
    const definition = CALCULATORS[id];
    const values: CalcValues = Object.fromEntries(definition.fields.map((f) => [f.key, f.defaultValue]));
    const result = definition.compute(values);
    expect(result.headline.value).toMatch(/\S/);
    expect(result.headline.value).not.toMatch(/NaN|Infinity/);
  });

  it("payback por defecto: 1 año, ámbar 'Muy conveniente'", () => {
    const values: CalcValues = Object.fromEntries(CALCULATORS.payback.fields.map((f) => [f.key, f.defaultValue]));
    const result = CALCULATORS.payback.compute(values);
    expect(result.headline.value).toBe("1 año");
    expect(result.verdict).toEqual({ tone: "amber", label: "Muy conveniente" });
  });
});
