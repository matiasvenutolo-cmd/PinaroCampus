import "server-only";

import { lookupCertificateByCode } from "@/lib/db/scope/certificates";

import { normalizeCertificateCode } from "./code";

export type PublicCertificate =
  | { state: "not_found"; code: string }
  | {
      state: "valid" | "revoked";
      code: string;
      /** Solo en `valid`: el nombre no se muestra en un certificado revocado. */
      holderName: string | null;
      courseTitle: string;
      hours: string;
      issuedAt: Date;
      revokedAt: Date | null;
      issuerName: string;
    };

/**
 * Datos públicos de un certificado por código (docs/06). La búsqueda es
 * global: valida aunque se consulte desde el dominio de otra cámara. Nunca
 * incluye el motivo de una revocación, el DNI ni el PDF.
 */
export async function getPublicCertificate(rawCode: string): Promise<PublicCertificate> {
  const code = normalizeCertificateCode(rawCode);
  if (!code) return { state: "not_found", code: rawCode.trim().toUpperCase().slice(0, 20) };
  const found = await lookupCertificateByCode(code);
  if (!found) return { state: "not_found", code };

  const { certificate, tenant } = found;
  const revoked = certificate.revokedAt !== null;
  return {
    state: revoked ? "revoked" : "valid",
    code: certificate.code,
    holderName: revoked ? null : certificate.holderName,
    courseTitle: certificate.courseTitle,
    hours: certificate.hours,
    issuedAt: certificate.issuedAt,
    revokedAt: certificate.revokedAt,
    issuerName: tenant.name,
  };
}
