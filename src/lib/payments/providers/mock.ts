import { env } from "@/env";

import type { CheckoutInput, CheckoutResult, PaymentProvider } from "../types";

/**
 * Pago simulado para las demos (docs/04): solo en cámaras `is_demo` y con
 * `DEMO_MODE=true`. Redirige a una pantalla que imita un checkout; lo que se
 * elija ahí entra por `applyPaymentUpdate`, igual que un pago real.
 */
export const mockProvider: PaymentProvider = {
  id: "mock",

  isAvailable(tenant) {
    return tenant.isDemo && env.DEMO_MODE && tenant.paymentMethods.includes("mock");
  },

  async createCheckout({ paymentId }: CheckoutInput): Promise<CheckoutResult> {
    return {
      payment: { externalId: `mock_${paymentId}`, status: "pending" },
      next: { kind: "redirect", url: `/checkout/simulado/${paymentId}` },
    };
  },
};
