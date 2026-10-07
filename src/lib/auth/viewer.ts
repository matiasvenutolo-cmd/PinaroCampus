import "server-only";

import { forTenant } from "@/lib/db/tenant-scope";
import { resolveTier, type PricingTier } from "@/lib/pricing";
import type { Tenant } from "@/lib/tenant/resolve";

import { auth } from "./config";

export interface Viewer {
  user: { id: string; email: string; name: string | null };
  membership: NonNullable<Awaited<ReturnType<ReturnType<typeof forTenant>["memberships"]["findByUserId"]>>>;
  tier: PricingTier;
}

/** Quién mira la página en esta cámara; `null` si es anónimo. Nunca redirige. */
export async function getViewer(tenant: Tenant): Promise<Viewer | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const scoped = forTenant(tenant.id);
  const membership = await scoped.memberships.findByUserId(session.user.id);
  if (!membership) return null;

  const company = membership.companyId ? await scoped.companies.findById(membership.companyId) : null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? null,
    },
    membership,
    tier: resolveTier({ memberStatus: membership.memberStatus, companyIsMember: company?.isMember ?? false }),
  };
}
