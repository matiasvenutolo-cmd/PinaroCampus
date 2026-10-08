import { Download } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyButton } from "@/components/checkout/copy-button";
import { OrderSummary } from "@/components/checkout/order-summary";
import { SeatInviteForm } from "@/components/checkout/seat-invite-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { sendInvites } from "@/lib/payments/actions";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mi compra" };

const STATUS_LABEL = { available: "Disponible", sent: "Enviado", redeemed: "Canjeado", revoked: "Anulado" } as const;

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; orderId: string }>;
  searchParams: Promise<{ invitar?: string; enviados?: string; "sin-codigo"?: string; invalidos?: string }>;
}) {
  const { domain, orderId } = await params;
  const query = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();
  const { user } = await requireMembership(tenant.id);

  const scoped = forTenant(tenant.id);
  const order = await scoped.orders.findById(orderId);
  if (!order || order.buyerUserId !== user.id) notFound();
  if (order.status === "pending" || order.status === "failed") redirect(`/checkout/${order.id}`);
  const [item] = await scoped.orders.items(order.id);

  if (order.type === "individual" || order.status !== "paid") {
    const slug = (await scoped.catalog.listAssigned()).find((c) => c.courseId === item.courseId)?.slug;
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-10">
        <Link href="/mis-compras" className="text-sm text-muted-foreground hover:text-foreground">← Mis compras</Link>
        <div className="mt-4 flex flex-col gap-4">
          <OrderSummary order={order} item={item} />
          {order.status === "awaiting_payment" ? (
            <Link href={`/checkout/${order.id}/resultado`} className={cn(buttonVariants(), "h-9 w-fit")}>Ver los datos para transferir</Link>
          ) : null}
          {order.status === "paid" && slug ? (
            <Link href={`/aprender/${slug}`} className={cn(buttonVariants(), "h-9 w-fit")}>Ir al curso</Link>
          ) : null}
        </div>
      </div>
    );
  }

  const [codes, summary] = await Promise.all([scoped.seatCodes.listForOrder(order.id), scoped.seatCodes.summaryForOrder(order.id)]);
  const available = codes.filter((c) => c.status === "available").length;
  const invited = query.invitar === "ok";

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-10">
      <Link href="/mis-compras" className="text-sm text-muted-foreground hover:text-foreground">← Mis compras</Link>
      <div className="mt-4 flex flex-col gap-6">
        <OrderSummary order={order} item={item} />

        <section aria-label="Resumen de vacantes" className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Compradas" value={summary.total} />
          <Stat label="Enviadas" value={summary.sent + summary.redeemed} />
          <Stat label="Canjeadas" value={summary.redeemed} />
        </section>

        {invited ? (
          <p role="status" className="rounded-lg bg-success/15 px-3 py-2 text-sm text-success">
            Enviamos {query.enviados} {query.enviados === "1" ? "código" : "códigos"}.
            {Number(query["sin-codigo"]) > 0 ? ` ${query["sin-codigo"]} no se enviaron porque no quedaban códigos disponibles.` : ""}
            {Number(query.invalidos) > 0 ? ` ${query.invalidos} emails tenían errores y se omitieron.` : ""}
          </p>
        ) : query.invitar === "vacio" ? (
          <p role="alert" className="text-sm text-danger">No encontramos ningún email válido.</p>
        ) : query.invitar === "error" ? (
          <p role="alert" className="text-sm text-danger">No pudimos enviar los códigos. Probá de nuevo.</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <CopyButton text={codes.map((c) => c.code).join("\n")} label="Copiar todos los códigos" doneLabel="Códigos copiados" />
          {/* Descarga de un CSV desde un route handler: un <a> común. */}
          <a href={`/mis-compras/${order.id}/codigos.csv`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Download className="size-4" aria-hidden /> Descargar CSV
          </a>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Persona</th>
                <th className="px-4 py-2 font-medium">Avance</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono tracking-wide">{c.code}</td>
                  <td className="px-4 py-2">
                    <Badge variant={c.status === "redeemed" ? "default" : "secondary"}>{STATUS_LABEL[c.status]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.status === "redeemed"
                      ? `${c.redeemerName ?? c.redeemerEmail}${c.redeemedAt ? ` · ${formatDate(c.redeemedAt)}` : ""}`
                      : c.sentToEmail
                        ? `Enviado a ${c.sentToEmail}`
                        : "—"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-muted-foreground">{c.status === "redeemed" ? `${c.progressPct ?? 0}%` : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {c.status === "available" || c.status === "sent" ? <CopyButton text={c.code} label="Copiar" doneLabel="Copiado" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <SeatInviteForm action={sendInvites.bind(null, order.id)} available={available} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
