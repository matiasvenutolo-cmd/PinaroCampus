// Sin `server-only`: lo reusa scripts/seed.ts fuera del bundler de Next.
import { formatCuit } from "@/lib/cuit";
import { forTenant } from "@/lib/db/tenant-scope";

import type { Tenant } from "./resolve";

type MemberStatus = "none" | "pending" | "verified";

/**
 * Resuelve `member_status` y la empresa a asociar según el modo de
 * validación de la cámara (docs/01-producto.md, tabla de modos). Se llama
 * desde el onboarding (`/bienvenida`) con el CUIT que cargó el alumno.
 */
export async function resolveMembershipForCuit({
  tenant,
  cuit,
  userEmail,
}: {
  tenant: Tenant;
  cuit: string | null;
  userEmail: string;
}): Promise<{ companyId: string | null; memberStatus: MemberStatus }> {
  if (!cuit) return { companyId: null, memberStatus: "none" };

  const scoped = forTenant(tenant.id);
  const existing = await scoped.companies.findByCuit(cuit);
  // Si el CUIT no está en el padrón, se guarda igual como `self_declared`
  // (docs/01-producto.md): es dato comercial valioso para la cámara.
  const company =
    existing ??
    (await scoped.companies.create({
      cuit,
      legalName: `Empresa ${formatCuit(cuit)}`,
      isMember: false,
      source: "self_declared",
    }));

  if (tenant.memberValidationMode === "open") {
    return { companyId: company.id, memberStatus: "none" };
  }
  if (tenant.memberValidationMode === "manual") {
    return { companyId: company.id, memberStatus: "pending" };
  }
  if (!company.isMember) {
    return { companyId: company.id, memberStatus: "none" };
  }
  if (tenant.memberValidationMode === "cuit") {
    return { companyId: company.id, memberStatus: "verified" };
  }

  // cuit_email_domain: además del CUIT, el dominio del email tiene que
  // matchear; si no, queda pendiente de que un admin lo apruebe a mano.
  const domain = userEmail.split("@")[1]?.toLowerCase();
  const domainMatches = domain
    ? company.emailDomains.map((d) => d.toLowerCase()).includes(domain)
    : false;
  return { companyId: company.id, memberStatus: domainMatches ? "verified" : "pending" };
}
