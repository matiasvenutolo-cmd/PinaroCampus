import { NextResponse } from "next/server";

import { expireStaleOrders } from "@/lib/db/scope/orders";
import { env } from "@/env";

export const runtime = "nodejs";

/**
 * Cron cada hora (vercel.json): `pending`/`awaiting_payment` con `expires_at`
 * vencido pasan a `expired` (72 h; las transferencias, los días que configure
 * la cámara). Exige `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const expired = await expireStaleOrders();
  console.log(JSON.stringify({ event: "orders_expired", count: expired.length }));
  return NextResponse.json({ expired: expired.length });
}
