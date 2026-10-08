import type { Order, OrderItem } from "@/lib/db/scope/orders";
import type { Tenant } from "@/lib/tenant/resolve";

// docs/04-pagos.md: la lógica de órdenes, inscripciones y códigos no sabe qué
// proveedor se usa; sumar uno nuevo es implementar `PaymentProvider`.

export type ProviderId = "mock" | "manual" | "mercadopago";

/** Estados que un proveedor puede informar para un pago. */
export type NormalizedStatus = "approved" | "pending" | "in_process" | "rejected" | "cancelled" | "refunded";

export interface CheckoutInput {
  tenant: Tenant;
  order: Order;
  items: OrderItem[];
  /** Fila de `payments` ya creada para este intento. */
  paymentId: string;
  buyer: { email: string; firstName?: string | null; lastName?: string | null };
  urls: { success: string; failure: string; pending: string; notification: string };
}

export interface CheckoutResult {
  payment: { externalId?: string; preferenceId?: string; status: "created" | "pending" };
  next: { kind: "redirect"; url: string } | { kind: "instructions"; markdown: string };
}

export interface NormalizedPayment {
  externalId: string;
  /** `order.id` */
  externalReference: string;
  status: NormalizedStatus;
  amountCents: number;
  feeCents: number;
  raw: unknown;
}

export interface PaymentProvider {
  id: ProviderId;
  /** ¿Está habilitado y usable para esta cámara? (p. ej. Mercado Pago requiere cuenta conectada). */
  isAvailable(tenant: Tenant): boolean | Promise<boolean>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Webhooks: verifica la firma y devuelve los ids a consultar. NO confía en el payload. */
  parseWebhook?(req: Request): Promise<{ valid: boolean; tenantId?: string; externalIds: string[] }>;
  fetchPayment?(tenant: Tenant, externalId: string): Promise<NormalizedPayment>;
  /** v2: reembolsos. */
  refund?(tenant: Tenant, externalId: string): Promise<void>;
}
