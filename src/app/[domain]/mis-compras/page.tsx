import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/checkout/status-badge";
import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatCents, formatDate } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export const metadata = { title: "Mis compras" };

export default async function MyPurchasesPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();
  const { user } = await requireMembership(tenant.id);

  const orders = await forTenant(tenant.id).orders.listForBuyer(user.id);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
      <h1 className="text-2xl font-semibold">Mis compras</h1>

      {orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full text-primary" style={{ background: "var(--primary-soft)" }}>
            <ShoppingBag className="size-6" aria-hidden />
          </span>
          <p className="font-medium">Todavía no hiciste ninguna compra</p>
          <p className="text-sm text-muted-foreground">Cuando compres un curso o un paquete de vacantes lo vas a ver acá.</p>
          <Button asChild className="mt-2">
            <Link href="/cursos">Ver cursos</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={order.status === "pending" || order.status === "failed" ? `/checkout/${order.id}` : `/mis-compras/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{order.courseTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.number} · {formatDate(order.createdAt)} ·{" "}
                    {order.type === "seat_pack" ? `${order.quantity} vacantes` : "Inscripción individual"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{order.totalCents === 0 ? "Gratis" : formatCents(order.totalCents)}</span>
                  <StatusBadge status={order.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
