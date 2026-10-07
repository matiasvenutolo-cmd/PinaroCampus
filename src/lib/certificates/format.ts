const TIME_ZONE = "America/Argentina/Buenos_Aires";

/** "14 de octubre de 2026" (hora argentina). */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "6" → "6 horas", "1.0" → "1 hora", "1.5" → "1,5 horas". */
export function formatHours(hours: string | number): string {
  const value = Number(hours);
  const text = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
  return `${text} ${value === 1 ? "hora" : "horas"}`;
}

/** DNI de 7–8 dígitos → "30.123.456"; si no parece un DNI, se deja como lo cargó la persona. */
export function formatDni(dni: string): string {
  const digits = dni.replace(/[.\s-]/g, "");
  if (!/^\d{7,8}$/.test(digits)) return dni.trim();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
