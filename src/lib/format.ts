const TIME_ZONE = "America/Argentina/Buenos_Aires";

const numberFormat = (maximumFractionDigits: number) =>
  new Intl.NumberFormat("es-AR", { maximumFractionDigits });

/** `1234.5` → "1.234,5". Por defecto sin decimales. */
export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return numberFormat(maximumFractionDigits).format(value);
}

/** Pesos enteros → "$ 45.000". */
export function formatPesos(pesos: number): string {
  return `$ ${formatNumber(Math.round(pesos))}`;
}

/** Montos en centavos (regla 3 de CLAUDE.md) → "$ 45.000". */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
    .format(cents / 100)
    .replace(/\s/g, " ");
}

/** Fechas siempre en UTC en la base, mostradas en hora argentina: "14/10/2026". */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** 360 → "6 h", 95 → "1 h 35 min", 20 → "20 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
