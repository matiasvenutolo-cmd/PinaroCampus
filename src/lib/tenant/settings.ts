import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";

import type { TenantCertificateConfig } from "./types";

/**
 * `tenants` no tiene `tenant_id` (su `id` es el tenant): se actualiza por el
 * id del tenant resuelto por host, nunca por uno que mande el cliente.
 */
export async function updateTenantCertificateConfig(tenantId: string, config: TenantCertificateConfig) {
  await db.update(tenants).set({ certificateConfig: config, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
}
