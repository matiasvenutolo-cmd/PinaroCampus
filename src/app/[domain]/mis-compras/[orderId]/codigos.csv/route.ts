import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { toCsv } from "@/lib/csv";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDate } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant/context";

/** CSV de los códigos de una compra de vacantes (solo de quien la hizo). */
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const tenant = await getCurrentTenant();
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("No autorizado", { status: 401 });

  const scoped = forTenant(tenant.id);
  const { orderId } = await params;
  const order = await scoped.orders.findById(orderId);
  if (!order || order.buyerUserId !== session.user.id || order.type !== "seat_pack") {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const labels = { available: "Disponible", sent: "Enviado", redeemed: "Canjeado", revoked: "Anulado" } as const;
  const codes = await scoped.seatCodes.listForOrder(order.id);
  const csv = toCsv([
    ["Código", "Estado", "Enviado a", "Canjeado por", "Fecha de canje", "Avance (%)"],
    ...codes.map((c) => [
      c.code,
      labels[c.status],
      c.sentToEmail,
      c.redeemerEmail,
      c.redeemedAt ? formatDate(c.redeemedAt) : "",
      c.status === "redeemed" ? (c.progressPct ?? 0) : "",
    ]),
  ]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vacantes-${order.number}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
