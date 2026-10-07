import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { CertificateDocument, type CertificatePdfData, type PdfPicture } from "@/lib/certificates/pdf";

const squiggle: PdfPicture = {
  kind: "svg",
  viewBox: [0, 0, 220, 80],
  paths: ["M8 58 C 20 20, 34 14, 38 30 C 41 44, 26 62, 30 66 C 36 70, 52 30, 60 34"],
  stroke: "#1F2A44",
};

const SIGNATORIES = [
  { name: "Ing. Laura Benítez", role: "Presidenta", signatureUrl: null },
  { name: "Lic. Diego Salvatierra", role: "Coordinador de Capacitación", signatureUrl: null },
  { name: "Cdor. Martín Olmos Fernández de la Vega", role: "Tesorero de la Comisión Directiva", signatureUrl: null },
];

async function build(overrides: Partial<CertificatePdfData> & { signatories?: number } = {}): Promise<CertificatePdfData> {
  const { signatories = 2, ...rest } = overrides;
  const verifyUrl = "https://plataforma.pinaro.ar/verificar/PC-7K3M-Q9TD";
  return {
    code: "PC-7K3M-Q9TD",
    holderName: "María Fernanda Gómez",
    holderDni: "30123456",
    courseTitle: "Eficiencia energética para PyMEs industriales",
    hours: "6.0",
    score: 87,
    issuedAt: new Date("2026-10-14T15:00:00Z"),
    verifyUrl,
    verifyDisplay: verifyUrl.replace("https://", ""),
    qrDataUrl: await QRCode.toDataURL(verifyUrl, { margin: 0, width: 320 }),
    logo: null,
    signatures: SIGNATORIES.slice(0, signatories).map(() => squiggle),
    snapshot: {
      tenantName: "Cámara Industrial Valle Azul",
      tenantShortName: "CIVA",
      logoUrl: null,
      primaryColor: "#1E4FA3",
      title: "Certificado de aprobación",
      graded: true,
      signatories: SIGNATORIES.slice(0, signatories),
      footerText: "Actividad de capacitación de la Cámara Industrial Valle Azul.",
      showDni: true,
    },
    ...rest,
  };
}

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

async function render(name: string, data: CertificatePdfData) {
  // `CertificateDocument` devuelve un <Document>, que es lo que `renderToBuffer` espera.
  const pdf = await renderToBuffer(createElement(CertificateDocument, { data }) as unknown as ReactElement<DocumentProps>);
  if (process.env.PDF_OUT_DIR) {
    mkdirSync(process.env.PDF_OUT_DIR, { recursive: true });
    writeFileSync(path.join(process.env.PDF_OUT_DIR, `${name}.pdf`), pdf);
  }
  return pdf;
}

describe("PDF del certificado", () => {
  it.each([0, 1, 2, 3])("se genera en una sola hoja A4 apaisada con %i firmantes", async (signatories) => {
    const pdf = await render(`firmantes-${signatories}`, await build({ signatories }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
    // A4 apaisado: 841.89 × 595.28 pt
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 841\.89\d* 595\.28\d*\]/);
  });

  it("un nombre de 60+ caracteres no desborda la hoja", async () => {
    const holderName = "María de los Ángeles Fernández de Kirchner Rodríguez Pérez Gómez";
    expect(holderName.length).toBeGreaterThan(60);
    const pdf = await render("nombre-largo", await build({ holderName, signatories: 3 }));
    expect(pageCount(pdf)).toBe(1);
  });

  it("un curso con título largo tampoco", async () => {
    const pdf = await render(
      "curso-largo",
      await build({
        courseTitle: "Gestión integral de la energía, el aire comprimido y la eficiencia térmica en plantas industriales de mediano porte",
        signatories: 3,
      }),
    );
    expect(pageCount(pdf)).toBe(1);
  });

  it("sin DNI, sin nota y sin pie sigue en una hoja", async () => {
    const base = await build({ holderDni: null, signatories: 1 });
    const pdf = await render("minimo", {
      ...base,
      snapshot: { ...base.snapshot, graded: false, footerText: null, showDni: false },
    });
    expect(pageCount(pdf)).toBe(1);
  });
});
