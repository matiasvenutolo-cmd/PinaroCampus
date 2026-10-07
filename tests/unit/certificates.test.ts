import { describe, expect, it } from "vitest";

import { CODE_ALPHABET, generateCertificateCode, normalizeCertificateCode } from "@/lib/certificates/code";
import { formatDni, formatHours, formatLongDate } from "@/lib/certificates/format";
import { linkedInAddUrl } from "@/lib/certificates/linkedin";
import { toCsv } from "@/lib/csv";

describe("código de certificado", () => {
  it("tiene el formato PC-XXXX-XXXX con el alfabeto sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCertificateCode();
      expect(code).toMatch(/^PC-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      for (const char of code.slice(3).replace("-", "")) expect(CODE_ALPHABET).toContain(char);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("no repite en una tanda razonable", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateCertificateCode));
    expect(codes.size).toBe(1000);
  });

  it("normaliza lo que escribe una persona", () => {
    expect(normalizeCertificateCode("pc-7k3m-q9td")).toBe("PC-7K3M-Q9TD");
    expect(normalizeCertificateCode("  PC 7K3M Q9TD ")).toBe("PC-7K3M-Q9TD");
    expect(normalizeCertificateCode("PC7K3MQ9TD")).toBe("PC-7K3M-Q9TD");
  });

  it("rechaza lo que no es un código", () => {
    expect(normalizeCertificateCode("")).toBeNull();
    expect(normalizeCertificateCode("PC-7K3M")).toBeNull();
    expect(normalizeCertificateCode("XX-7K3M-Q9TD")).toBeNull();
    expect(normalizeCertificateCode("PC-0O1I-LLLL")).toBeNull();
    expect(normalizeCertificateCode("PC-7K3M-Q9TD'; drop table certificates;--")).toBeNull();
  });
});

describe("formato del certificado", () => {
  it("fecha larga en español, en hora argentina", () => {
    expect(formatLongDate(new Date("2026-10-14T15:00:00Z"))).toBe("14 de octubre de 2026");
    // 01:00 UTC del 15 todavía es 14 en Argentina
    expect(formatLongDate(new Date("2026-10-15T01:00:00Z"))).toBe("14 de octubre de 2026");
  });

  it("horas en singular y plural", () => {
    expect(formatHours("6.0")).toBe("6 horas");
    expect(formatHours("1.0")).toBe("1 hora");
    expect(formatHours(1.5)).toBe("1,5 horas");
  });

  it("DNI con puntos si parece un DNI", () => {
    expect(formatDni("30123456")).toBe("30.123.456");
    expect(formatDni("30.123.456")).toBe("30.123.456");
    expect(formatDni("9876543")).toBe("9.876.543");
    expect(formatDni("AB-123")).toBe("AB-123");
  });
});

describe("LinkedIn", () => {
  it("prellena nombre, organización, fecha, id y URL", () => {
    const url = new URL(
      linkedInAddUrl({
        courseTitle: "Eficiencia energética",
        issuerName: "Cámara Industrial Valle Azul",
        issuedAt: new Date("2026-10-14T15:00:00Z"),
        code: "PC-7K3M-Q9TD",
        verifyUrl: "https://plataforma.pinaro.ar/verificar/PC-7K3M-Q9TD",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(url.searchParams.get("startTask")).toBe("CERTIFICATION_NAME");
    expect(url.searchParams.get("name")).toBe("Eficiencia energética");
    expect(url.searchParams.get("organizationName")).toBe("Cámara Industrial Valle Azul");
    expect(url.searchParams.get("issueYear")).toBe("2026");
    expect(url.searchParams.get("issueMonth")).toBe("10");
    expect(url.searchParams.get("certId")).toBe("PC-7K3M-Q9TD");
    expect(url.searchParams.get("certUrl")).toBe("https://plataforma.pinaro.ar/verificar/PC-7K3M-Q9TD");
  });
});

describe("toCsv", () => {
  it("separa con ; y escapa comillas y saltos de línea", () => {
    const csv = toCsv([["a", 'b "c"', "d;e", "f\ng"]]);
    expect(csv).toBe('﻿a;"b ""c""";"d;e";"f\ng"\r\n');
  });

  it("neutraliza fórmulas de planilla", () => {
    const csv = toCsv([["=HYPERLINK(1)", "+1", "-1", "@x", "normal"]]);
    expect(csv).toBe("﻿'=HYPERLINK(1);'+1;'-1;'@x;normal\r\n");
  });

  it("null y undefined quedan vacíos", () => {
    expect(toCsv([[null, undefined, 0]])).toBe("﻿;;0\r\n");
  });
});
