import { formatCents } from "@/lib/format";

import type { CheckoutInput, CheckoutResult, PaymentProvider } from "../types";

/** Transferencia: la orden queda esperando y la cámara la marca pagada a mano. */
export const manualProvider: PaymentProvider = {
  id: "manual",

  isAvailable(tenant) {
    return tenant.paymentMethods.includes("manual") && Boolean(tenant.manualPaymentInstructions?.trim());
  },

  async createCheckout({ tenant, order }: CheckoutInput): Promise<CheckoutResult> {
    const markdown = [
      tenant.manualPaymentInstructions?.trim() ?? "",
      "",
      `Importe a transferir: ${formatCents(order.totalCents)}`,
      `Referencia: ${order.number}`,
    ].join("\n");
    return { payment: { status: "pending" }, next: { kind: "instructions", markdown } };
  },
};
