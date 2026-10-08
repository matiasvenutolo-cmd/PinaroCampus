import { StatusBadge } from "@/components/checkout/status-badge";
import type { Order, OrderItem } from "@/lib/db/scope/orders";
import { formatCents, formatDate } from "@/lib/format";

/** Resumen de una orden: número, curso, cantidad, precio fijado y total. */
export function OrderSummary({ order, item }: { order: Order; item: OrderItem }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Orden {order.number}</p>
          <p className="mt-1 font-semibold leading-snug">{item.courseTitle}</p>
          <p className="text-sm text-muted-foreground">
            {order.type === "seat_pack" ? `${item.quantity} vacantes` : "Inscripción individual"} ·{" "}
            {order.pricingTier === "member" ? "precio socio" : "precio general"} · {formatDate(order.createdAt)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <dl className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-sm">
        {order.type === "seat_pack" ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              {item.quantity} × {formatCents(item.unitPriceCents)}
            </dt>
            <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{order.totalCents === 0 ? "Gratis" : formatCents(order.totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}
