import { manualProvider } from "./providers/manual";
import { mockProvider } from "./providers/mock";
import type { PaymentProvider, ProviderId } from "./types";

// Mercado Pago se registra en la Fase 5; hasta entonces, aunque la cámara lo
// tenga en `payment_methods`, no figura como medio disponible.
const providers: Partial<Record<ProviderId, PaymentProvider>> = {
  mock: mockProvider,
  manual: manualProvider,
};

export function getProvider(id: string): PaymentProvider | null {
  return providers[id as ProviderId] ?? null;
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  mock: "Pago simulado (demo)",
  manual: "Transferencia bancaria",
  mercadopago: "Mercado Pago",
};
