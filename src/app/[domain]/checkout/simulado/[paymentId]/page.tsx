import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatCents } from "@/lib/format";
import { simulatePayment } from "@/lib/payments/actions";
import { getProvider } from "@/lib/payments/registry";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export const metadata = { title: "Pago simulado" };

/** Imita un checkout externo para mostrar el flujo completo en una demo (proveedor `mock`). */
export default async function SimulatedCheckoutPage({ params }: { params: Promise<{ domain: string; paymentId: string }> }) {
  const { domain, paymentId } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  const provider = getProvider("mock");
  if (!tenant || !provider || !(await provider.isAvailable(tenant))) notFound();
  const { user } = await requireMembership(tenant.id);

  const scoped = forTenant(tenant.id);
  const payment = await scoped.payments.findById(paymentId);
  const order = payment ? await scoped.orders.findById(payment.orderId) : null;
  if (!payment || !order || order.buyerUserId !== user.id || payment.provider !== "mock") notFound();
  const [item] = await scoped.orders.items(order.id);
  const open = order.status === "pending";

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center px-4 py-10">
      <div className="rounded-xl border border-dashed border-warning bg-card p-6 text-center">
        <p className="rounded-md bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning">
          Esto es un pago simulado para la demo: no se cobra nada.
        </p>
        <p className="mt-5 text-sm text-muted-foreground">Orden {order.number}</p>
        <p className="font-semibold">{item.courseTitle}</p>
        {order.type === "seat_pack" ? <p className="text-sm text-muted-foreground">{item.quantity} vacantes</p> : null}
        <p className="mt-3 text-3xl font-semibold tabular-nums">{formatCents(order.totalCents)}</p>

        {open ? (
          <div className="mt-6 flex flex-col gap-2">
            <form action={simulatePayment.bind(null, payment.id, "approved")}>
              <Button type="submit" size="lg" className="h-10 w-full">
                Aprobar
              </Button>
            </form>
            <form action={simulatePayment.bind(null, payment.id, "rejected")}>
              <Button type="submit" size="lg" variant="outline" className="h-10 w-full">
                Rechazar
              </Button>
            </form>
            <form action={simulatePayment.bind(null, payment.id, "pending")}>
              <Button type="submit" size="lg" variant="ghost" className="h-10 w-full">
                Dejar pendiente
              </Button>
            </form>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Esta orden ya no admite cambios.</p>
        )}
      </div>
    </div>
  );
}
