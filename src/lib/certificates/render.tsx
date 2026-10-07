import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

import type { Certificate } from "@/lib/db/scope/certificates";
import type { CertificateSnapshot } from "@/lib/db/schema";
import { buildTenantUrl } from "@/lib/tenant/urls";

import { CertificateDocument, type CertificatePdfData, type PdfPicture } from "./pdf";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const FETCH_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function isSafeRemote(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname;
  // Nada de loopback, redes privadas ni IP literales: la URL la carga un admin de cámara.
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return false;
  return true;
}

function parseSvg(markup: string): PdfPicture | null {
  const viewBoxMatch = markup.match(/viewBox="([^"]+)"/i);
  const paths = [...markup.matchAll(/<path[^>]*\sd="([^"]+)"/gi)].map((m) => m[1]);
  if (!viewBoxMatch || paths.length === 0) return null;
  const numbers = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) return null;
  const stroke = markup.match(/stroke="(#[0-9a-f]{3,8})"/i)?.[1] ?? "#1F2937";
  return { kind: "svg", viewBox: numbers as [number, number, number, number], paths, stroke };
}

/** Logo o firma → algo que `react-pdf` sepa dibujar; `null` si no se puede (el PDF sigue sin la imagen). */
export async function loadPicture(url: string | null | undefined): Promise<PdfPicture | null> {
  if (!url) return null;
  try {
    const lower = url.split("?")[0].toLowerCase();
    const isSvg = lower.endsWith(".svg");
    const format = lower.endsWith(".png") ? "png" : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpg" : null;

    if (url.startsWith("/")) {
      const file = path.join(PUBLIC_DIR, path.normalize(url));
      if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
      const buffer = await readFile(file);
      if (isSvg) return parseSvg(buffer.toString("utf8"));
      return format ? { kind: "raster", src: { data: buffer, format } } : null;
    }

    const remote = new URL(url);
    if (!isSafeRemote(remote)) return null;
    if (isSvg) {
      const response = await fetch(remote, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) return null;
      return parseSvg(await response.text());
    }
    if (!format) return null;
    const response = await fetch(remote, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;
    return { kind: "raster", src: { data: buffer, format } };
  } catch {
    return null;
  }
}

export async function buildPdfData(input: {
  tenantId: string;
  code: string;
  holderName: string;
  holderDni: string | null;
  courseTitle: string;
  hours: string;
  score: number;
  issuedAt: Date;
  snapshot: CertificateSnapshot;
}): Promise<CertificatePdfData> {
  const verifyUrl = await buildTenantUrl(input.tenantId, `/verificar/${input.code}`);
  const [qrDataUrl, logo, signatures] = await Promise.all([
    QRCode.toDataURL(verifyUrl, { margin: 0, width: 320, errorCorrectionLevel: "M" }),
    loadPicture(input.snapshot.logoUrl),
    Promise.all(input.snapshot.signatories.map((s) => loadPicture(s.signatureUrl))),
  ]);
  return {
    code: input.code,
    holderName: input.holderName,
    holderDni: input.holderDni,
    courseTitle: input.courseTitle,
    hours: input.hours,
    score: input.score,
    issuedAt: input.issuedAt,
    snapshot: input.snapshot,
    verifyUrl,
    verifyDisplay: verifyUrl.replace(/^https?:\/\//, ""),
    qrDataUrl,
    logo,
    signatures,
  };
}

export async function renderCertificatePdf(certificate: Certificate): Promise<Buffer> {
  const data = await buildPdfData({ ...certificate });
  return renderToBuffer(<CertificateDocument data={data} />);
}

export async function renderPdfFromData(data: CertificatePdfData): Promise<Buffer> {
  return renderToBuffer(<CertificateDocument data={data} />);
}
