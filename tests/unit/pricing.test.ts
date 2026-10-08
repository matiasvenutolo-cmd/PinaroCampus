import { describe, expect, it } from "vitest";

import {
  canPurchaseCourse,
  platformFee,
  quoteOrder,
  resolvePurchaseTier,
  resolveTier,
  type MemberValidationMode,
  type OrderKind,
} from "@/lib/pricing";

const MODES: MemberValidationMode[] = ["open", "cuit", "cuit_email_domain", "manual"];
const TYPES: OrderKind[] = ["individual", "seat_pack"];
const memberCompany = { id: "c1", isMember: true };
const otherCompany = { id: "c2", isMember: true };
const nonMemberCompany = { id: "c3", isMember: false };

const verifiedOfC1 = { memberStatus: "verified", companyId: "c1" };
const pendingOfC1 = { memberStatus: "pending", companyId: "c1" };
const noneNoCompany = { memberStatus: "none", companyId: null };

describe("resolvePurchaseTier: modo de validación × tipo de orden × quién compra", () => {
  it("open: todos pagan el precio general, sea cual sea la empresa", () => {
    for (const type of TYPES) {
      expect(resolvePurchaseTier({ mode: "open", type, buyer: verifiedOfC1, company: memberCompany })).toBe("non_member");
      expect(resolvePurchaseTier({ mode: "open", type, buyer: null, company: null })).toBe("non_member");
    }
  });

  it("individual: solo el socio verificado de una empresa socia paga el precio de socio", () => {
    for (const mode of ["cuit", "cuit_email_domain", "manual"] as const) {
      expect(resolvePurchaseTier({ mode, type: "individual", buyer: verifiedOfC1, company: memberCompany })).toBe("member");
      // pendiente de aprobación: todavía no es socio
      expect(resolvePurchaseTier({ mode, type: "individual", buyer: pendingOfC1, company: memberCompany })).toBe("non_member");
      // sin empresa o con empresa no socia
      expect(resolvePurchaseTier({ mode, type: "individual", buyer: noneNoCompany, company: null })).toBe("non_member");
      expect(resolvePurchaseTier({ mode, type: "individual", buyer: { memberStatus: "verified", companyId: "c3" }, company: nonMemberCompany })).toBe("non_member");
      // anónimo
      expect(resolvePurchaseTier({ mode, type: "individual", buyer: null, company: null })).toBe("non_member");
    }
  });

  it("seat_pack en modo cuit: alcanza con que la empresa del CUIT sea socia", () => {
    expect(resolvePurchaseTier({ mode: "cuit", type: "seat_pack", buyer: noneNoCompany, company: memberCompany })).toBe("member");
    expect(resolvePurchaseTier({ mode: "cuit", type: "seat_pack", buyer: verifiedOfC1, company: otherCompany })).toBe("member");
    expect(resolvePurchaseTier({ mode: "cuit", type: "seat_pack", buyer: verifiedOfC1, company: nonMemberCompany })).toBe("non_member");
    expect(resolvePurchaseTier({ mode: "cuit", type: "seat_pack", buyer: verifiedOfC1, company: null })).toBe("non_member");
  });

  it("seat_pack en cuit_email_domain y manual: además el comprador tiene que ser socio verificado DE ESA empresa", () => {
    for (const mode of ["cuit_email_domain", "manual"] as const) {
      expect(resolvePurchaseTier({ mode, type: "seat_pack", buyer: verifiedOfC1, company: memberCompany })).toBe("member");
      expect(resolvePurchaseTier({ mode, type: "seat_pack", buyer: pendingOfC1, company: memberCompany })).toBe("non_member");
      expect(resolvePurchaseTier({ mode, type: "seat_pack", buyer: noneNoCompany, company: memberCompany })).toBe("non_member");
      // verificado, pero de OTRA empresa socia
      expect(resolvePurchaseTier({ mode, type: "seat_pack", buyer: verifiedOfC1, company: otherCompany })).toBe("non_member");
      expect(resolvePurchaseTier({ mode, type: "seat_pack", buyer: verifiedOfC1, company: nonMemberCompany })).toBe("non_member");
    }
  });

  it("recorre todas las combinaciones sin lanzar errores", () => {
    for (const mode of MODES) for (const type of TYPES) {
      for (const buyer of [null, verifiedOfC1, pendingOfC1, noneNoCompany]) {
        for (const company of [null, memberCompany, nonMemberCompany]) {
          expect(["member", "non_member"]).toContain(resolvePurchaseTier({ mode, type, buyer, company }));
        }
      }
    }
  });
});

describe("canPurchaseCourse: visibilidad × precio", () => {
  it("public se compra con cualquier precio", () => {
    expect(canPurchaseCourse("public", "member")).toBe(true);
    expect(canPurchaseCourse("public", "non_member")).toBe(true);
  });
  it("members_only solo lo compra quien paga como socio", () => {
    expect(canPurchaseCourse("members_only", "member")).toBe(true);
    expect(canPurchaseCourse("members_only", "non_member")).toBe(false);
  });
  it("hidden no se compra", () => {
    expect(canPurchaseCourse("hidden", "member")).toBe(false);
  });
});

describe("resolveTier (vista del alumno)", () => {
  it("socio = verificado y empresa socia", () => {
    expect(resolveTier({ memberStatus: "verified", companyIsMember: true })).toBe("member");
    expect(resolveTier({ memberStatus: "verified", companyIsMember: false })).toBe("non_member");
    expect(resolveTier({ memberStatus: "pending", companyIsMember: true })).toBe("non_member");
    expect(resolveTier(null)).toBe("non_member");
  });
});

describe("montos en centavos enteros", () => {
  it("comisión con redondeo al centavo", () => {
    expect(platformFee(4_500_000, 3000)).toBe(1_350_000);
    expect(platformFee(4_500_000, 5000)).toBe(2_250_000);
    expect(platformFee(10_001, 3000)).toBe(3_000); // 3000,3 → 3000
    expect(platformFee(10_005, 3000)).toBe(3_002); // 3001,5 → 3002
    expect(platformFee(123_456, 0)).toBe(0);
  });

  it("cotiza vacantes: subtotal = unitario × cantidad, sin decimales", () => {
    const quote = quoteOrder({ unitPriceCents: 4_500_000, quantity: 10, platformFeeBps: 3000 });
    expect(quote).toEqual({
      unitPriceCents: 4_500_000,
      quantity: 10,
      subtotalCents: 45_000_000,
      totalCents: 45_000_000,
      platformFeeCents: 13_500_000,
    });
    for (const value of Object.values(quote)) expect(Number.isInteger(value)).toBe(true);
  });

  it("un curso gratis cotiza en cero", () => {
    expect(quoteOrder({ unitPriceCents: 0, quantity: 3, platformFeeBps: 5000 })).toMatchObject({ totalCents: 0, platformFeeCents: 0 });
  });
});
