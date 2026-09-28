import { describe, expect, it } from "vitest";

// Test trivial de la Fase 0: solo confirma que vitest está corriendo.
// Se reemplaza por tests reales (pricing, cuit, tenant-scope) en fases siguientes.
describe("fase 0", () => {
  it("corre vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
