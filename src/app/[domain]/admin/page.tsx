import Link from "next/link";

import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

/** Inicio del panel: lo que está esperando una acción. El dashboard con KPIs llega con los reportes. */
export default async function AdminDashboardPage() {
  const tenant = await getCurrentTenant();
  const scoped = forTenant(tenant.id);
  const [pendingTransfers, pendingMembers, certificates] = await Promise.all([
    scoped.orders.countPendingTransfers(),
    scoped.memberships.countPending(),
    scoped.certificates.countActive(),
  ]);

  const cards = [
    { href: "/admin/ordenes?estado=transferencias", label: "Transferencias por confirmar", value: pendingTransfers },
    { href: "/admin/socios", label: "Pedidos de socio pendientes", value: pendingMembers },
    { href: "/admin/certificados", label: "Certificados emitidos", value: certificates },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Panel de {tenant.campusName}</h1>
      <ul className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href}>
            <Link href={card.href} className="block rounded-xl border border-border bg-card p-4 hover:bg-muted">
              <p className="text-3xl font-semibold tabular-nums">{card.value}</p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
