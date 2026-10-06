import "server-only";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getTenantByHost, getTenantBySlug, type Tenant } from "./resolve";

const SLUG_PREFIX = "__slug__";

/** `domain` es el segmento que arma el middleware: un hostname real o
 * `__slug__<slug>` cuando el superadmin está "viendo como" otra cámara. */
export async function resolveTenantFromDomainParam(domain: string): Promise<Tenant | null> {
  if (domain.startsWith(SLUG_PREFIX)) {
    return getTenantBySlug(domain.slice(SLUG_PREFIX.length));
  }
  return getTenantByHost(decodeURIComponent(domain));
}

/** Para Server Components que no reciben `params.domain` directamente. */
export async function getCurrentTenant(): Promise<Tenant> {
  const tenantParam = (await headers()).get("x-pc-tenant-param");
  const tenant = tenantParam ? await resolveTenantFromDomainParam(tenantParam) : null;
  if (!tenant) notFound();
  return tenant;
}

/** El host real del request (nunca el slug del preview) — lo usa Auth.js
 * para saber en qué dominio se pidió el magic link. */
export async function getCurrentHost(): Promise<string | null> {
  return (await headers()).get("x-pc-host");
}
