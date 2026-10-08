import { Badge } from "@/components/ui/badge";
import type { Order } from "@/lib/db/scope/orders";

export const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pendiente de pago",
  awaiting_payment: "Esperando la transferencia",
  paid: "Pagada",
  failed: "Pago rechazado",
  cancelled: "Cancelada",
  expired: "Vencida",
  refunded: "Reembolsada",
};

export function StatusBadge({ status }: { status: Order["status"] }) {
  const variant = status === "paid" ? "default" : status === "failed" || status === "cancelled" || status === "expired" ? "destructive" : "secondary";
  return <Badge variant={variant}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
