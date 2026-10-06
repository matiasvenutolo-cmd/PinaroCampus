import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";

function currentHourWindow(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

/**
 * Ventana fija de 1 hora (docs/02-arquitectura.md: "5 por email por hora y 20
 * por IP por hora"). Atómico vía `ON CONFLICT ... DO UPDATE` para no pisarse
 * entre pedidos concurrentes.
 */
export async function checkAndIncrementRateLimit(key: string, max: number): Promise<boolean> {
  const windowStart = currentHourWindow();
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  return (row?.count ?? 0) <= max;
}
