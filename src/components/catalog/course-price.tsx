import { formatCents } from "@/lib/format";
import type { PricingTier } from "@/lib/pricing";

/**
 * Precio según quién mira (docs/08): un socio verificado ve solo el precio
 * socio; el resto ve el precio no socio y, chico, el de socios. En modo
 * `open` no hay distinción de socios.
 */
export function CoursePrice({
  priceMemberCents,
  priceNonMemberCents,
  tier,
  memberPricing,
  size = "md",
}: {
  priceMemberCents: number;
  priceNonMemberCents: number;
  tier: PricingTier;
  memberPricing: boolean;
  size?: "md" | "lg";
}) {
  const big = size === "lg" ? "text-3xl" : "text-lg";
  const money = (cents: number) => (cents === 0 ? "Gratis" : formatCents(cents));

  if (!memberPricing) {
    return <p className={`${big} font-semibold`}>{money(priceNonMemberCents)}</p>;
  }
  if (tier === "member") {
    return (
      <div>
        <p className={`${big} font-semibold`}>{money(priceMemberCents)}</p>
        <span
          className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
        >
          Precio socio
        </span>
      </div>
    );
  }
  return (
    <div>
      <p className={`${big} font-semibold`}>{money(priceNonMemberCents)}</p>
      {priceMemberCents !== priceNonMemberCents ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Socios: {priceMemberCents === 0 ? "gratis" : formatCents(priceMemberCents)}
        </p>
      ) : null}
    </div>
  );
}
