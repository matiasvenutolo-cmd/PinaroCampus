import { CircleCheck, CircleX, Clock, Landmark } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/checkout/auto-refresh";
import { CopyButton } from "@/components/checkout/copy-button";
import { OrderSummary } from "@/components/checkout/order-summary";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatCents, formatDate } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";

export const metadata = { title: "Resultado del pago" };

/**
 * Muestra el estado de la orden en la base: no confía en los query params que
 * pueda mandar un proveedor al volver (docs/04).
 */
export default async function CheckoutResultPage({ params }: { params: Promise<{ domain: string; orderId: string }> }) {
  const { domain, orderId } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();
  const { user } = await requireMembership(tenant.id);

  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order || order.buyerUserId !== user.id) notFound();
  const [item] = await scoped.orders.items(order.id);
  const slug = (await scoped.catalog.listAssigned()).find((c) => c.courseId === item.courseId)?.slug;

  const waiting = order.status === "pending" && order.paymentProvider !== null && order.paymentProvider !== "manual";
  const instructions = `${tenant.manualPaymentInstructions ?? ""}\nImporte: ${formatCents(order.totalCents)}\nReferencia: ${order.number}`.trim();

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      {waiting ? <AutoRefresh /> : null}
      <div className="flex flex-col gap-6">
        {order.status === "paid" ? (
          <Banner icon={<CircleCheck className="size-9 text-success" aria-hidden />} title="¡Pago confirmado!">
            {order.type === "seat_pack"
              ? "Tus códigos de vacante ya están listos."
              : "Ya estás inscripto. Te mandamos la confirmación por email."}
          </Banner>
        ) : order.status === "awaiting_payment" ? (
          <Banner icon={<Landmark className="size-9 text-primary" aria-hidden />} title="Falta la transferencia">
            Hacé la transferencia con los datos de abajo. Cuando la cámara la confirme, tu {order.type === "seat_pack" ? "paquete de vacantes" : "inscripción"} se
            activa y te avisamos por email.
          </Banner>
        ) : order.status === "failed" ? (
          <Banner icon={<CircleX className="size-9 text-danger" aria-hidden />} title="No se pudo procesar el pago">
            No se te cobró nada. Podés volver a intentarlo.
          </Banner>
        ) : order.status === "cancelled" || order.status === "expired" ? (
          <Banner icon={<CircleX className="size-9 text-muted-foreground" aria-hidden />} title={order.status === "expired" ? "La orden venció" : "Orden cancelada"}>
            Si todavía querés el curso, empezá de nuevo desde el catálogo.
          </Banner>
        ) : (
          <Banner icon={<Clock className="size-9 text-muted-foreground" aria-hidden />} title="Estamos confirmando tu pago">
            Puede tardar unos minutos. Te avisamos por email apenas se acredite.
          </Banner>
        )}

        <OrderSummary order={order} item={item} />

        {order.status === "awaiting_payment" ? (
          <section aria-label="Datos para transferir" className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Datos para transferir</h2>
            <p className="mt-2 whitespace-pre-line text-sm">{instructions}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <CopyButton text={instructions} label="Copiar datos" doneLabel="Datos copiados" />
              {order.expiresAt ? (
                <p className="text-xs text-muted-foreground">La orden vence el {formatDate(order.expiresAt)}.</p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {order.status === "paid" && order.type === "individual" && slug ? (
            <Link href={`/aprender/${slug}`} className={cn(buttonVariants(), "h-9")}>
              Ir al curso
            </Link>
          ) : null}
          {order.status === "paid" && order.type === "seat_pack" ? (
            <Link href={`/mis-compras/${order.id}`} className={cn(buttonVariants(), "h-9")}>
              Ver mis códigos
            </Link>
          ) : null}
          {order.status === "failed" ? (
            <Link href={`/checkout/${order.id}`} className={cn(buttonVariants(), "h-9")}>
              Reintentar el pago
            </Link>
          ) : null}
          <Link href="/mis-compras" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
            Mis compras
          </Link>
        </div>
      </div>
    </div>
  );
}

function Banner({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5">
      {icon}
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
