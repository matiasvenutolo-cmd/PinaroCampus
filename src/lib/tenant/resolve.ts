import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenantDomains, tenants } from "@/lib/db/schema";

export type Tenant = typeof tenants.$inferSelect;

/**
 * Resuelve el tenant por hostname exacto (tal como llega en el header `Host`,
 * con puerto en dev). Memoizado por request con `cache()` de React — no hay
 * cache entre requests todavía (ver docs/DECISIONES.md): cualquier cambio de
 * un admin se ve reflejado en el próximo request, sin invalidación manual.
 */
export const getTenantByHost = cache(async (host: string): Promise<Tenant | null> => {
  const normalizedHost = host.toLowerCase();
  const rows = await db
    .select({ tenant: tenants })
    .from(tenantDomains)
    .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
    .where(eq(tenantDomains.hostname, normalizedHost));

  const tenant = rows[0]?.tenant ?? null;
  if (!tenant || tenant.status === "suspended") return null;
  return tenant;
});

/** Usado por el preview de superadmin ("ver como") y por `/preview` (Fase 2). */
export const getTenantBySlug = cache(async (slug: string): Promise<Tenant | null> => {
  const rows = await db.select().from(tenants).where(eq(tenants.slug, slug));
  const tenant = rows[0] ?? null;
  if (!tenant || tenant.status === "suspended") return null;
  return tenant;
});

export const getTenantById = cache(async (tenantId: string): Promise<Tenant | null> => {
  const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return rows[0] ?? null;
});
