// Precio socio / no socio (docs/01-producto.md). Siempre se calcula en el
// servidor. Por ahora solo cubre una compra individual; la compra de vacantes
// y los tests de todas las combinaciones llegan en la Fase 4.

export type PricingTier = "member" | "non_member";

/** Socio = pedido de socio verificado y empresa que figura como socia activa. */
export function resolveTier(
  viewer: { memberStatus: string; companyIsMember: boolean } | null,
): PricingTier {
  return viewer && viewer.memberStatus === "verified" && viewer.companyIsMember ? "member" : "non_member";
}

export function getUnitPrice(
  tenantCourse: { priceMemberCents: number; priceNonMemberCents: number },
  tier: PricingTier,
): number {
  return tier === "member" ? tenantCourse.priceMemberCents : tenantCourse.priceNonMemberCents;
}
