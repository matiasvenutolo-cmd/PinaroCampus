import { describe, expect, it } from "vitest";

import { buildValidCuit, formatCuit, isValidCuit, normalizeCuit } from "@/lib/cuit";

describe("cuit", () => {
  it("normaliza sacando guiones y espacios", () => {
    expect(normalizeCuit("20-12345678-9")).toBe("20123456789");
    expect(normalizeCuit("20 12345678 9")).toBe("20123456789");
  });

  it("formatea 11 dígitos con guiones", () => {
    expect(formatCuit("20123456789")).toBe("20-12345678-9");
  });

  it("valida un CUIT con dígito verificador correcto", () => {
    expect(isValidCuit("30-50001091-2")).toBe(true);
  });

  it("rechaza un dígito verificador incorrecto", () => {
    expect(isValidCuit("30-50001091-0")).toBe(false);
    expect(isValidCuit("30-50001091-1")).toBe(false);
  });

  it("rechaza CUITs con longitud inválida", () => {
    expect(isValidCuit("123")).toBe(false);
    expect(isValidCuit("")).toBe(false);
  });

  it("buildValidCuit siempre produce un CUIT que pasa isValidCuit", () => {
    for (let i = 0; i < 20; i++) {
      const base = `30${String(i * 10).padStart(8, "0")}`;
      const cuit = buildValidCuit(base);
      expect(isValidCuit(cuit)).toBe(true);
    }
  });

  it("buildValidCuit no choca entre seeds espaciados por 10", () => {
    const cuits = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const base = `30${String(i * 10).padStart(8, "0")}`;
      cuits.add(buildValidCuit(base));
    }
    expect(cuits.size).toBe(20);
  });
});
