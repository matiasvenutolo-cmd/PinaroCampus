import { randomInt } from "node:crypto";

// Sin 0/O, 1/I/L: se lee y se dicta sin confusiones (docs/06).
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const CODE_PATTERN = /^PC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

function block(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** `PC-XXXX-XXXX` con `crypto.randomInt`. El reintento ante colisión lo hace quien inserta. */
export function generateCertificateCode(): string {
  return `PC-${block(4)}-${block(4)}`;
}

/** Normaliza lo que escribe una persona ("pc 7k3m q9td") a un código canónico, o `null` si no lo es. */
export function normalizeCertificateCode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (!/^PC[A-Z0-9]{8}$/.test(compact)) return null;
  const code = `PC-${compact.slice(2, 6)}-${compact.slice(6)}`;
  return CODE_PATTERN.test(code) ? code : null;
}
