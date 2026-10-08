import { describe, expect, it } from "vitest";

import { generateSeatCode, generateSeatCodes, normalizeSeatCode, parseEmailList } from "@/lib/seat-codes";

describe("códigos de vacante", () => {
  it("tienen formato XXXX-XXXX sin caracteres ambiguos", () => {
    for (let i = 0; i < 300; i++) expect(generateSeatCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  });

  it("generateSeatCodes devuelve exactamente N distintos", () => {
    const codes = generateSeatCodes(200);
    expect(codes).toHaveLength(200);
    expect(new Set(codes).size).toBe(200);
  });

  it("normaliza lo que escribe la gente", () => {
    expect(normalizeSeatCode("abcd-2345")).toBe("ABCD-2345");
    expect(normalizeSeatCode(" abcd 2345 ")).toBe("ABCD-2345");
    expect(normalizeSeatCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("rechaza lo que no es un código (incluye caracteres ambiguos)", () => {
    expect(normalizeSeatCode("")).toBeNull();
    expect(normalizeSeatCode("ABC-2345")).toBeNull();
    expect(normalizeSeatCode("ABCD-23O5")).toBeNull();
    expect(normalizeSeatCode("ABCD-2345-9")).toBeNull();
    expect(normalizeSeatCode("'; drop table seat_codes;--")).toBeNull();
  });
});

describe("parseEmailList", () => {
  it("separa por línea, coma, punto y coma o espacios (pegado desde Excel)", () => {
    const { valid, invalid } = parseEmailList("ana@empresa.com\nLuis@Empresa.com; marta@empresa.com,\tjuan@empresa.com");
    expect(valid).toEqual(["ana@empresa.com", "luis@empresa.com", "marta@empresa.com", "juan@empresa.com"]);
    expect(invalid).toEqual([]);
  });

  it("separa válidos, inválidos y repetidos", () => {
    const { valid, invalid } = parseEmailList("ana@empresa.com\nana@empresa.com\nsin-arroba\nx@y\n@z.com");
    expect(valid).toEqual(["ana@empresa.com"]);
    expect(invalid).toEqual(["sin-arroba", "x@y", "@z.com"]);
  });

  it("vacío no da nada", () => {
    expect(parseEmailList("  \n ")).toEqual({ valid: [], invalid: [] });
  });
});
