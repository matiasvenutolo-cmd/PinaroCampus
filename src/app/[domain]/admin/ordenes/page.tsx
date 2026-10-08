import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/checkout/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatCents, formatDate } from "@/lib/format";
import { PROVIDER_LABEL } from "@/lib/payments/registry";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";

import { cancelOrderAsAdmin, markOrderPaid } from "./actions";
import { parseOrderFilters, type OrderSearchParams } from "./filters";

export const metadata = { title: "Órdenes" };

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  pagada: { text: "Orden marcada como pagada. Se inscribió o se generaron los códigos y se avisó por email.", error: false },
  cancelada: { text: "Orden cancelada.", error: false },
  estado: { text: "Esa orden ya no admite ese cambio (cambió de estado).", error: true },
  datos: { text: "No pudimos procesar el pedido.", error: true },
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<OrderSearchParams & { ok?: string; error?: string }>;
}) {
  const { domain } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const filters = parseOrderFilters(query);
  const orders = await forTenant(tenant.id).orders.listForAdmin(filters);
  const message = MESSAGES[query.error ?? query.ok ?? ""];
  const exportParams = new URLSearchParams(
    Object.entries({ q: query.q, estado: query.estado, desde: query.desde, hasta: query.hasta }).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Órdenes</h1>
        <div className="flex gap-2">
          <Link href="/admin/ordenes?estado=transferencias" className={cn(buttonVariants({ variant: query.estado === "transferencias" ? "default" : "outline" }), "h-9")}>
            Transferencias pendientes
          </Link>
          {/* Descarga de un CSV desde un route handler: un <a> común. */}
          <a href={`/admin/ordenes/export${exportParams ? `?${exportParams}` : ""}`} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        </div>
      </div>

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}

      <form method="get" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <Label htmlFor="q" className="text-xs">Buscar (orden, comprador, email, empresa o curso)</Label>
          <Input id="q" name="q" defaultValue={query.q} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado" className="text-xs">Estado</Label>
          <select id="estado" name="estado" defaultValue={query.estado ?? ""} className={selectClass}>
            <option value="">Todos</option>
            <option value="transferencias">Transferencias pendientes</option>
            <option value="paid">Pagadas</option>
            <option value="pending">Pendientes de pago</option>
            <option value="failed">Rechazadas</option>
            <option value="expired">Vencidas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desde" className="text-xs">Desde</Label>
            <Input id="desde" name="desde" type="date" defaultValue={query.desde} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hasta" className="text-xs">Hasta</Label>
            <Input id="hasta" name="hasta" type="date" defaultValue={query.hasta} />
          </div>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit">Filtrar</Button>
          <Link href="/admin/ordenes" className={cn(buttonVariants({ variant: "ghost" }))}>Limpiar</Link>
          <p className="ml-auto text-sm text-muted-foreground">{orders.length} {orders.length === 1 ? "orden" : "órdenes"}</p>
        </div>
      </form>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay órdenes con esos filtros.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => {
            const awaitingTransfer = o.status === "awaiting_payment" && o.paymentProvider === "manual";
            const lateTransfer = o.status === "expired" && o.paymentProvider === "manual";
            const open = o.status === "pending" || o.status === "awaiting_payment" || o.status === "failed";
            return (
              <li key={o.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {o.number} <span className="font-normal text-muted-foreground">· {o.courseTitle}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {o.buyerName ?? o.buyerEmail} ({o.buyerEmail}){o.companyName ? ` · ${o.companyName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(o.createdAt)} · {o.type === "seat_pack" ? `${o.quantity} vacantes` : "individual"} · precio {o.tier === "member" ? "socio" : "general"}
                      {o.paymentProvider ? ` · ${PROVIDER_LABEL[o.paymentProvider]}` : ""}
                      {o.paidAt ? ` · pagada el ${formatDate(o.paidAt)}` : ""}
                      {awaitingTransfer && o.expiresAt ? ` · vence el ${formatDate(o.expiresAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-lg font-semibold tabular-nums">{o.totalCents === 0 ? "Gratis" : formatCents(o.totalCents)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                </div>

                {awaitingTransfer || lateTransfer || open ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
                    {awaitingTransfer || lateTransfer ? (
                      <form action={markOrderPaid} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="orderId" value={o.id} />
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`ref-${o.id}`} className="text-xs">Nro. de operación (opcional)</Label>
                          <Input id={`ref-${o.id}`} name="reference" maxLength={100} className="w-48" />
                        </div>
                        <Button type="submit" size="sm">Marcar como pagada</Button>
                      </form>
                    ) : null}
                    {open ? (
                      <form action={cancelOrderAsAdmin}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <Button type="submit" size="sm" variant="outline" className="text-danger">Cancelar orden</Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
