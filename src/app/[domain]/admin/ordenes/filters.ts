import type { OrderAdminFilters } from "@/lib/db/scope/orders";

export interface OrderSearchParams {
  q?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}

const STATUSES = ["pending", "awaiting_payment", "paid", "failed", "cancelled", "expired", "refunded"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const isDay = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** Filtros de la URL → filtros de la consulta. "transferencias" = pendientes de confirmar. Fechas en hora argentina. */
export function parseOrderFilters(params: OrderSearchParams): OrderAdminFilters {
  const filters: OrderAdminFilters = {};
  if (params.q?.trim()) filters.q = params.q.trim().slice(0, 100);
  if (params.estado === "transferencias") filters.pendingTransfers = true;
  else if ((STATUSES as readonly string[]).includes(params.estado ?? "")) filters.status = params.estado as (typeof STATUSES)[number];
  if (isDay(params.desde)) filters.from = new Date(`${params.desde}T00:00:00-03:00`);
  if (isDay(params.hasta)) filters.to = new Date(new Date(`${params.hasta}T00:00:00-03:00`).getTime() + DAY_MS);
  return filters;
}
