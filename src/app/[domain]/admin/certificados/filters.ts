import type { CertificateAdminFilters } from "@/lib/db/scope/certificates";

export interface CertificateSearchParams {
  q?: string;
  curso?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isDay = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** Filtros de la URL → filtros de la consulta. Las fechas son días de Argentina (UTC-3). */
export function parseCertificateFilters(params: CertificateSearchParams): CertificateAdminFilters {
  const filters: CertificateAdminFilters = {};
  if (params.q?.trim()) filters.q = params.q.trim().slice(0, 100);
  if (params.curso && /^[0-9a-f-]{36}$/i.test(params.curso)) filters.courseId = params.curso;
  if (params.estado === "vigente") filters.status = "active";
  if (params.estado === "revocado") filters.status = "revoked";
  if (isDay(params.desde)) filters.from = new Date(`${params.desde}T00:00:00-03:00`);
  if (isDay(params.hasta)) filters.to = new Date(new Date(`${params.hasta}T00:00:00-03:00`).getTime() + DAY_MS);
  return filters;
}
