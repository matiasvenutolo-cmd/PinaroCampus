import { notFound, redirect } from "next/navigation";

import { OrderSummary } from "@/components/checkout/order-summary";
import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { availableProviders, } from "@/lib/payments/service";
import { PROVIDER_LABEL } from "@/lib/payments/registry";
import { cancelMyOrder, chooseProvider } from "@/lib/payments/actions";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export const metadata = { title: "Pagar" };

const ERRORS: Record<string, string> = {
  "medio-no-disponible": "Ese medio de pago no está disponible. Elegí otro.",
  "orden-no-disponible": "Esa orden ya no se puede pagar.",
  "no-disponible": "No pudimos iniciar el pago. Probá de nuevo.",
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; orderId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { domain, orderId } = await params;
  const { error } = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();
  const { user } = await requireMembership(tenant.id);

  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order || order.buyerUserId !== user.id) notFound();
  if (order.status === "paid" || order.status === "awaiting_payment") redirect(`/checkout/${order.id}/resultado`);

  const [item] = await scoped.orders.items(order.id);
  const providers = order.status === "pending" || order.status === "failed" ? await availableProviders(tenant) : [];
  const payable = providers.length > 0;

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <h1 className="text-2xl font-semibold">Pagar</h1>
      <div className="mt-6 flex flex-col gap-6">
        <OrderSummary order={order} item={item} />

        {order.status === "failed" ? (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            El último pago fue rechazado. Podés volver a intentarlo.
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-danger">{ERRORS[error] ?? ERRORS["no-disponible"]}</p> : null}

        {payable ? (
          <form action={chooseProvider.bind(null, order.id)} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Elegí cómo pagar</legend>
              {providers.map((id, index) => (
                <label key={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-[var(--primary-soft)]">
                  <input type="radio" name="provider" value={id} defaultChecked={index === 0} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>
                    <span className="font-medium">{PROVIDER_LABEL[id]}</span>
                    {id === "manual" ? (
                      <span className="block text-xs text-muted-foreground">
                        Te mostramos los datos para transferir; se activa cuando la cámara confirme el pago.
                      </span>
                    ) : null}
                    {id === "mock" ? (
                      <span className="block text-xs text-muted-foreground">Solo para la demo: simula un checkout, sin cobrar nada.</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" size="lg" className="h-10">
              Continuar
            </Button>
          </form>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {order.status === "pending" || order.status === "failed"
              ? `Esta cámara todavía no habilitó ningún medio de pago. Escribinos a ${tenant.contactEmail}.`
              : "Esta orden ya no se puede pagar."}
          </p>
        )}

        {order.status === "pending" || order.status === "failed" ? (
          <form action={cancelMyOrder.bind(null, order.id)}>
            <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
              Cancelar la orden
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
