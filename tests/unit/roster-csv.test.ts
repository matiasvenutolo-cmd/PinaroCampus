import { describe, expect, it } from "vitest";

import { buildValidCuit } from "@/lib/cuit";
import { parseCsv, parseRosterCsv } from "@/lib/roster-csv";

const CUIT_A = buildValidCuit("3000000001");
const CUIT_B = buildValidCuit("3000000002");

describe("parseCsv", () => {
  it("detecta ; , y tab, y respeta comillas", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv('a,b\n"x, y","dijo ""hola"""')).toEqual([["a", "b"], ["x, y", 'dijo "hola"']]);
  });

  it("ignora el BOM, los saltos de línea de Windows y las líneas vacías", () => {
    expect(parseCsv("﻿a;b\r\n1;2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseRosterCsv", () => {
  it("lee un padrón completo con encabezados en español", () => {
    const csv = `CUIT;Razón social;Nombre de fantasía;Socio;Dominios\n${CUIT_A};Talleres Brisco S.A.;Brisco;Sí;brisco.com.ar brisco.com\n${CUIT_B};Envases Norte S.R.L.;;No;`;
    const result = parseRosterCsv(csv);
    expect(result.fatal).toBeNull();
    expect(result.errors).toEqual([]);
    expect(result.rows).toMatchObject([
      { cuit: CUIT_A, legalName: "Talleres Brisco S.A.", tradeName: "Brisco", isMember: true, emailDomains: ["brisco.com.ar", "brisco.com"] },
      { cuit: CUIT_B, legalName: "Envases Norte S.R.L.", tradeName: null, isMember: false, emailDomains: [] },
    ]);
  });

  it("acepta el CUIT con guiones y sin la columna de socio (queda en no)", () => {
    const formatted = `${CUIT_A.slice(0, 2)}-${CUIT_A.slice(2, 10)}-${CUIT_A.slice(10)}`;
    const result = parseRosterCsv(`cuit,razon social\n${formatted},Empresa Uno`);
    expect(result.rows).toMatchObject([{ cuit: CUIT_A, isMember: false }]);
  });

  it("reporta cada fila mala con su línea y sigue con las buenas", () => {
    const csv = [
      "CUIT,Razón social,Socio,Dominios",
      `${CUIT_A},Buena S.A.,si,buena.com`,
      "20-12345678-0,CUIT inválido S.A.,si,",
      `${CUIT_B},,si,`,
      `${CUIT_B},Mala socio S.A.,quizás,`,
      `${CUIT_B},Mal dominio S.A.,no,no es dominio`,
      `${CUIT_A},Repetida S.A.,si,`,
    ].join("\n");
    const result = parseRosterCsv(csv);
    expect(result.total).toBe(6);
    expect(result.rows.map((r) => r.line)).toEqual([2]);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(result.errors[0].message).toMatch(/CUIT inválido/);
    expect(result.errors[1].message).toMatch(/razón social/);
    expect(result.errors[2].message).toMatch(/sí o no/);
    expect(result.errors[3].message).toMatch(/dominio inválido/);
    expect(result.errors[4].message).toMatch(/repetido/);
  });

  it("rechaza archivos sin las columnas obligatorias, vacíos o enormes", () => {
    expect(parseRosterCsv("nombre,socio\nx,si").fatal).toMatch(/CUIT/);
    expect(parseRosterCsv("").fatal).toMatch(/vacío/);
    expect(parseRosterCsv("cuit,razon social").fatal).toMatch(/filas de datos/);
    expect(parseRosterCsv(`cuit,razon social\n${"x".repeat(1_100_000)}`).fatal).toMatch(/1 MB/);
  });
});
