import { describe, expect, it } from "vitest";

import { ADVANCED_CALCULATORS, defaultDateValue } from "@/lib/calculators/advanced";
import {
  addMonths,
  parseDay,
  tractionMaintenanceSchedule,
  wormGearBacklash,
  type ScheduleInput,
} from "@/lib/calculators/traction";

const TODAY = parseDay("2026-10-09")!;

/** Los datos del caso práctico (M-194 de Las Tipas) con la fecha de hoy fija. */
function lasTipas(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    today: TODAY,
    serviceStart: addMonths(TODAY, -14),
    hoursTotal: 3600,
    hoursPerMonth: 260,
    firstOilDone: false,
    lastOilChange: null,
    oilIntervalMonths: 24,
    lastGreasing: addMonths(TODAY, -7),
    lastBacklashCheck: null,
    ...overrides,
  };
}

const byId = (rows: ReturnType<typeof tractionMaintenanceSchedule>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe("traction-maintenance-schedule (valores del caso práctico)", () => {
  it("aceite, engrase y control de juego aparecen vencidos", () => {
    const rows = byId(tractionMaintenanceSchedule(lasTipas()));
    expect(rows.oil.status).toBe("overdue");
    expect(rows.grease.status).toBe("overdue");
    expect(rows.backlash.status).toBe("overdue");
  });

  it("el primer cambio de aceite manda por plazo: 12 meses vencieron hace ~2 meses (las 4.000 h llegan después)", () => {
    const { oil } = byId(tractionMaintenanceSchedule(lasTipas()));
    expect(oil.basis).toBe("12 meses desde la puesta en servicio");
    expect(oil.daysLeft).toBe(-61);
  });

  it("el engrase venció hace 1 mes (último hace 7 meses, frecuencia de 6)", () => {
    const { grease } = byId(tractionMaintenanceSchedule(lasTipas()));
    expect(grease.daysLeft).toBe(-30);
  });

  it("el control de juego nunca se hizo: las 3.000 h se superaron hace ~2 meses", () => {
    const { backlash } = byId(tractionMaintenanceSchedule(lasTipas()));
    expect(backlash.basis).toBe("3.000 horas de servicio entre controles");
    expect(backlash.daysLeft).toBe(-70);
  });

  it("si las 4.000 h llegan antes que los 12 meses, manda la fecha por horas", () => {
    const { oil } = byId(tractionMaintenanceSchedule(lasTipas({ serviceStart: addMonths(TODAY, -6), hoursTotal: 3900, hoursPerMonth: 650 })));
    expect(oil.basis).toBe("4.000 horas de servicio");
    expect(oil.daysLeft).toBe(5); // 100 h ÷ 650 h/mes × 30,4375 días
    expect(oil.status).toBe("soon");
  });

  it("con el primer cambio hecho, el siguiente es el último + 24 o 18 meses", () => {
    const last = addMonths(TODAY, -10);
    const at24 = byId(tractionMaintenanceSchedule(lasTipas({ firstOilDone: true, lastOilChange: last, oilIntervalMonths: 24 }))).oil;
    const at18 = byId(tractionMaintenanceSchedule(lasTipas({ firstOilDone: true, lastOilChange: last, oilIntervalMonths: 18 }))).oil;
    expect(at24.status).toBe("ok");
    expect(at24.daysLeft).toBeGreaterThan(30);
    expect(at18.dueDate.getTime()).toBeLessThan(at24.dueDate.getTime());
    expect(at18.basis).toBe("último cambio + 18 meses");
  });

  it("'vence en menos de 30 días' es ámbar y más lejos es verde", () => {
    const soon = byId(tractionMaintenanceSchedule(lasTipas({ lastGreasing: addMonths(TODAY, -6) }))).grease; // vence hoy
    expect(soon.daysLeft).toBe(0);
    expect(soon.status).toBe("soon");
    const ok = byId(tractionMaintenanceSchedule(lasTipas({ lastGreasing: addMonths(TODAY, -1) }))).grease;
    expect(ok.status).toBe("ok");
  });

  it("con un control de juego previo cuenta desde esa fecha", () => {
    const { backlash } = byId(tractionMaintenanceSchedule(lasTipas({ lastBacklashCheck: addMonths(TODAY, -3) })));
    expect(backlash.status).toBe("ok");
    // 3.000 h a 260 h/mes son ~351 días: llegan antes que los 12 meses.
    expect(backlash.basis).toBe("3.000 horas de servicio entre controles");
    expect(backlash.daysLeft).toBe(351 - 92); // el último control fue hace 3 meses calendario (92 días)
    const slow = byId(tractionMaintenanceSchedule(lasTipas({ lastBacklashCheck: addMonths(TODAY, -3), hoursPerMonth: 100 }))).backlash;
    expect(slow.basis).toBe("12 meses desde el último control");
  });

  it("sin horas por mes, solo cuenta el plazo", () => {
    const { backlash, oil } = byId(tractionMaintenanceSchedule(lasTipas({ hoursPerMonth: 0 })));
    expect(oil.basis).toBe("12 meses desde la puesta en servicio");
    expect(backlash.basis).toBe("12 meses desde la puesta en servicio");
  });

  it("addMonths respeta fin de mes", () => {
    expect(addMonths(parseDay("2026-01-31")!, 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(parseDay("2026-10-09")!, -14).toISOString().slice(0, 10)).toBe("2025-08-09");
    expect(parseDay("2026-02-30")).toBeNull();
  });
});

describe("worm-gear-backlash (valores del caso práctico)", () => {
  it("M-194 con A = 21 mm → 37,7% del rango, en verde", () => {
    const r = wormGearBacklash({ model: "M-194", distanceMm: 21 });
    expect(r.pct).toBeCloseTo(37.7, 1);
    expect(r.state).toBe("green");
    expect(r.barPct).toBeCloseTo(37.7, 1);
  });

  it("de 70% a 100% es ámbar y más de 100% es rojo (el valor real se conserva)", () => {
    expect(wormGearBacklash({ model: "M-194", distanceMm: 4.4 + 0.7 * 44 }).state).toBe("amber");
    expect(wormGearBacklash({ model: "M-194", distanceMm: 48.4 }).state).toBe("amber");
    const over = wormGearBacklash({ model: "M-194", distanceMm: 60 });
    expect(over.state).toBe("red");
    expect(over.pct).toBeGreaterThan(100);
    expect(over.barPct).toBe(100);
  });

  it("menos que una máquina nueva pide revisar la medición", () => {
    const r = wormGearBacklash({ model: "M-202", distanceMm: 3 });
    expect(r.state).toBe("recheck");
    expect(r.barPct).toBe(0);
  });

  it.each([
    ["M-137", 3.5, 38.5],
    ["MV-137 RHINO", 3.5, 38.5],
    ["M-194", 4.4, 48.4],
    ["M-202", 4.8, 52.8],
  ] as const)("%s: nueva %s mm y desgastada %s mm dan 0% y 100%", (model, nueva, desgastada) => {
    expect(wormGearBacklash({ model, distanceMm: nueva }).pct).toBeCloseTo(0, 6);
    expect(wormGearBacklash({ model, distanceMm: desgastada }).pct).toBeCloseTo(100, 6);
  });
});

describe("calculadoras avanzadas: definiciones", () => {
  it("el cronograma calcula con sus valores por defecto y muestra tres tareas vencidas", () => {
    const def = ADVANCED_CALCULATORS["traction-maintenance-schedule"];
    const values = Object.fromEntries(def.fields.map((f) => [f.key, f.kind === "date" ? defaultDateValue(f, TODAY) : String(f.defaultValue ?? "")]));
    const result = def.compute(values, TODAY);
    expect(result.rows).toHaveLength(3);
    expect(result.rows!.map((r) => r.tone)).toEqual(["red", "red", "red"]);
    expect(result.rows![0].value).toMatch(/Vencido hace 61 días/);
    expect(result.note).toBe("Frecuencias según el manual de mantenimiento ADSUR, versión 01.2014");
  });

  it("el juego calcula con los valores por defecto: 37,7% y 'Dentro de tolerancia'", () => {
    const def = ADVANCED_CALCULATORS["worm-gear-backlash"];
    const values = Object.fromEntries(def.fields.map((f) => [f.key, String(f.defaultValue)]));
    const result = def.compute(values, TODAY);
    expect(result.headline?.value).toBe("37,7%");
    expect(result.verdict).toEqual({ tone: "green", label: "Dentro de tolerancia" });
    expect(result.bar?.pct).toBeCloseTo(37.7, 1);
    expect(result.note).toBe("El umbral de 70% es orientativo y no figura en el manual del fabricante.");
  });

  it("valida los datos de entrada", () => {
    const schedule = ADVANCED_CALCULATORS["traction-maintenance-schedule"];
    const base = Object.fromEntries(schedule.fields.map((f) => [f.key, f.kind === "date" ? defaultDateValue(f, TODAY) : String(f.defaultValue ?? "")]));
    expect(schedule.compute({ ...base, firstOilDone: "yes", lastOilChange: "" }, TODAY).errors?.lastOilChange).toBeTruthy();
    expect(schedule.compute({ ...base, lastGreasing: "2030-01-01" }, TODAY).errors?.lastGreasing).toBeTruthy();
    expect(schedule.compute({ ...base, hoursTotal: "-5" }, TODAY).errors?.hoursTotal).toBeTruthy();
    const backlash = ADVANCED_CALCULATORS["worm-gear-backlash"];
    expect(backlash.compute({ model: "M-194", distanceMm: "" }, TODAY).errors?.distanceMm).toBeTruthy();
    expect(backlash.compute({ model: "M-194", distanceMm: "abc" }, TODAY).errors?.distanceMm).toBeTruthy();
  });
});
