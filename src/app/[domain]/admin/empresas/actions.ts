"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/permissions";
import { isValidCuit, normalizeCuit } from "@/lib/cuit";
import { forTenant } from "@/lib/db/tenant-scope";
import { MAX_ROSTER_BYTES, parseRosterCsv, type RosterError } from "@/lib/roster-csv";
import { getCurrentTenant } from "@/lib/tenant/context";

const BACK = "/admin/empresas";

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
function parseDomains(raw: string): string[] | null {
  const out: string[] = [];
  for (const part of raw.split(/[\s,;|]+/)) {
    const domain = part.trim().toLowerCase().replace(/^@/, "");
    if (!domain) continue;
    if (!DOMAIN.test(domain)) return null;
    if (!out.includes(domain)) out.push(domain);
  }
  return out;
}

const companySchema = z.object({
  cuit: z.string(),
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().max(200).optional(),
  domains: z.string().max(500).default(""),
  isMember: z.boolean(),
});

function readCompany(formData: FormData) {
  return companySchema.safeParse({
    cuit: String(formData.get("cuit") ?? ""),
    legalName: formData.get("legalName"),
    tradeName: formData.get("tradeName") || undefined,
    domains: String(formData.get("domains") ?? ""),
    isMember: formData.get("isMember") === "on",
  });
}

/** Alta manual de una empresa del padrón. */
export async function addCompany(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const parsed = readCompany(formData);
  if (!parsed.success) redirect(`${BACK}?error=datos`);
  const cuit = normalizeCuit(parsed.data.cuit);
  if (!isValidCuit(cuit)) redirect(`${BACK}?error=cuit`);
  const emailDomains = parseDomains(parsed.data.domains);
  if (!emailDomains) redirect(`${BACK}?error=dominios`);

  const scoped = forTenant(tenant.id);
  if (await scoped.companies.findByCuit(cuit)) redirect(`${BACK}?error=existe`);
  const created = await scoped.companies.create({
    cuit,
    legalName: parsed.data.legalName,
    tradeName: parsed.data.tradeName ?? null,
    isMember: parsed.data.isMember,
    memberSince: parsed.data.isMember ? new Date().toISOString().slice(0, 10) : null,
    emailDomains,
    source: "admin",
  });
  await scoped.auditLog.record({
    actorUserId: user.id,
    action: "company.create",
    entityType: "company",
    entityId: created.id,
    data: { cuit, isMember: parsed.data.isMember },
  });
  redirect(`${BACK}?ok=alta`);
}

/** Edita una empresa (razón social, fantasía, socia sí/no, dominios). */
export async function saveCompany(formData: FormData) {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = readCompany(formData);
  if (!id.success || !parsed.success) redirect(`${BACK}?error=datos`);
  const emailDomains = parseDomains(parsed.data.domains);
  if (!emailDomains) redirect(`${BACK}?error=dominios`);

  const scoped = forTenant(tenant.id);
  const before = await scoped.companies.findById(id.data);
  if (!before) redirect(`${BACK}?error=datos`);
  const updated = await scoped.companies.update(id.data, {
    legalName: parsed.data.legalName,
    tradeName: parsed.data.tradeName ?? null,
    isMember: parsed.data.isMember,
    memberSince: parsed.data.isMember ? (before.memberSince ?? new Date().toISOString().slice(0, 10)) : null,
    emailDomains,
  });
  await scoped.auditLog.record({
    actorUserId: user.id,
    action: "company.update",
    entityType: "company",
    entityId: id.data,
    data: {
      before: { legalName: before.legalName, isMember: before.isMember, emailDomains: before.emailDomains },
      after: { legalName: updated?.legalName, isMember: updated?.isMember, emailDomains: updated?.emailDomains },
    },
  });
  redirect(`${BACK}?ok=editada`);
}

// ---- Importación por CSV: vista previa → confirmar ----

export interface ImportState {
  step: "idle" | "preview" | "done" | "error";
  message?: string;
  csv?: string;
  total?: number;
  valid?: number;
  newCount?: number;
  updateCount?: number;
  sample?: { line: number; cuit: string; legalName: string; isMember: boolean; isNew: boolean }[];
  errors?: RosterError[];
  created?: number;
  updated?: number;
}

async function readCsv(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ROSTER_BYTES) return null;
    return file.text();
  }
  const pasted = formData.get("csv");
  return typeof pasted === "string" && pasted.trim() ? pasted : "";
}

/** Paso 1: valida el CSV y muestra qué se crearía y qué se actualizaría, sin guardar nada. */
export async function previewRosterImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const tenant = await getCurrentTenant();
  await requireRole(tenant.id, "tenant_admin");

  const csv = await readCsv(formData);
  if (csv === null) return { step: "error", message: "El archivo supera 1 MB." };
  if (!csv) return { step: "error", message: "Elegí un archivo CSV o pegá su contenido." };

  const parsed = parseRosterCsv(csv);
  if (parsed.fatal) return { step: "error", message: parsed.fatal };

  const existing = new Set((await forTenant(tenant.id).companies.list()).map((c) => c.cuit));
  const newCount = parsed.rows.filter((r) => !existing.has(r.cuit)).length;
  return {
    step: "preview",
    csv,
    total: parsed.total,
    valid: parsed.rows.length,
    newCount,
    updateCount: parsed.rows.length - newCount,
    sample: parsed.rows.slice(0, 15).map((r) => ({
      line: r.line,
      cuit: r.cuit,
      legalName: r.legalName,
      isMember: r.isMember,
      isNew: !existing.has(r.cuit),
    })),
    errors: parsed.errors.slice(0, 100),
  };
}

/** Paso 2: vuelve a validar en el servidor y recién ahí hace el upsert por CUIT (las filas con error no entran). */
export async function confirmRosterImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const tenant = await getCurrentTenant();
  const { user } = await requireRole(tenant.id, "tenant_admin");

  const csv = String(formData.get("csv") ?? "");
  const parsed = parseRosterCsv(csv);
  if (parsed.fatal) return { step: "error", message: parsed.fatal };
  if (parsed.rows.length === 0) return { step: "error", message: "No hay filas válidas para importar." };

  const scoped = forTenant(tenant.id);
  const result = await scoped.companies.importRoster(parsed.rows);
  await scoped.auditLog.record({
    actorUserId: user.id,
    action: "roster.import",
    entityType: "company",
    entityId: null,
    data: { created: result.created, updated: result.updated, skipped: parsed.errors.length },
  });
  return { step: "done", created: result.created, updated: result.updated, errors: parsed.errors.slice(0, 100), total: parsed.total };
}
