// Precio socio / no socio (docs/01-producto.md y docs/04-pagos.md). Siempre
// se calcula en el servidor, al crear la orden, y queda fijado en ella.
// Funciones puras: las reglas se prueban en tests/unit/pricing.test.ts.

export type PricingTier = "member" | "non_member";
export type MemberValidationMode = "open" | "cuit" | "cuit_email_domain" | "manual";
export type OrderKind = "individual" | "seat_pack";
export type CourseVisibility = "public" | "members_only" | "hidden";

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

/**
 * Qué precio le toca a una compra.
 *
 * - `open`: no hay distinción de socios, todos pagan el precio no socio.
 * - `individual`: el del alumno (socio verificado de una empresa socia).
 * - `seat_pack`: el de la empresa del CUIT indicado. En `cuit` alcanza con que
 *   la empresa sea socia; en `cuit_email_domain` y `manual` además el comprador
 *   tiene que ser socio verificado **de esa** empresa.
 */
export function resolvePurchaseTier({
  mode,
  type,
  buyer,
  company,
}: {
  mode: MemberValidationMode;
  type: OrderKind;
  buyer: { memberStatus: string; companyId: string | null } | null;
  /** Empresa de la compra: la del comprador (individual) o la del CUIT indicado (vacantes). */
  company: { id: string; isMember: boolean } | null;
}): PricingTier {
  if (mode === "open" || !company || !company.isMember) return "non_member";

  if (type === "individual") {
    return buyer && buyer.memberStatus === "verified" && buyer.companyId === company.id ? "member" : "non_member";
  }

  if (mode === "cuit") return "member";
  return buyer && buyer.memberStatus === "verified" && buyer.companyId === company.id ? "member" : "non_member";
}

/** `members_only`: se ve para todos, pero solo compra quien paga como socio. */
export function canPurchaseCourse(visibility: CourseVisibility, tier: PricingTier): boolean {
  if (visibility === "hidden") return false;
  return !(visibility === "members_only" && tier !== "member");
}

/** Comisión de Pinaro en centavos enteros: `bps` = 5000 es 50%. */
export function platformFee(totalCents: number, bps: number): number {
  return Math.round((totalCents * bps) / 10_000);
}

export interface OrderQuote {
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
  totalCents: number;
  platformFeeCents: number;
}

export function quoteOrder({
  unitPriceCents,
  quantity,
  platformFeeBps,
}: {
  unitPriceCents: number;
  quantity: number;
  platformFeeBps: number;
}): OrderQuote {
  const subtotalCents = unitPriceCents * quantity;
  return {
    unitPriceCents,
    quantity,
    subtotalCents,
    totalCents: subtotalCents,
    platformFeeCents: platformFee(subtotalCents, platformFeeBps),
  };
}

export const SEAT_PACK_MIN = 2;
