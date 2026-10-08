import { NextResponse } from "next/server";

import { ORDER_STATUS_LABEL } from "@/components/checkout/status-badge";
import { requireRole } from "@/lib/auth/permissions";
import { toCsv } from "@/lib/csv";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { PROVIDER_LABEL } from "@/lib/payments/registry";
import { getCurrentTenant } from "@/lib/tenant/context";

import { parseOrderFilters } from "../filters";

/** CSV de órdenes con los mismos filtros del listado. Importes en pesos con decimales. */
export async function GET(request: Request) {
  const tenant = await getCurrentTenant();
  await requireRole(tenant.id, "tenant_admin");

  const filters = parseOrderFilters(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await forTenant(tenant.id).orders.listForAdmin(filters);

  const csv = toCsv([
    ["Orden", "Fecha", "Estado", "Tipo", "Curso", "Cantidad", "Comprador", "Email", "Empresa", "Precio", "Medio de pago", "Total ($)", "Comisión Pinaro ($)", "Fecha de pago"],
    ...rows.map((o) => [
      o.number,
      formatDate(o.createdAt),
      ORDER_STATUS_LABEL[o.status],
      o.type === "seat_pack" ? "Vacantes" : "Individual",
      o.courseTitle,
      o.quantity,
      o.buyerName,
      o.buyerEmail,
      o.companyName,
      o.tier === "member" ? "Socio" : "General",
      o.paymentProvider ? PROVIDER_LABEL[o.paymentProvider] : "",
      (o.totalCents / 100).toFixed(2).replace(".", ","),
      (o.platformFeeCents / 100).toFixed(2).replace(".", ","),
      o.paidAt ? formatDate(o.paidAt) : "",
    ]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ordenes-${tenant.slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
