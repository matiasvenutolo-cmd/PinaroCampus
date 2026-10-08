import { randomInt } from "node:crypto";

import { CODE_ALPHABET } from "@/lib/certificates/code";

const PATTERN = new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`);

function block(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Código de vacante `XXXX-XXXX` (sin 0/O/1/I/L), con `crypto.randomInt`. */
export function generateSeatCode(): string {
  return `${block(4)}-${block(4)}`;
}

/** "abcd 2345" / "abcd-2345" / "ABCD2345" → "ABCD-2345"; `null` si no es un código. */
export function normalizeSeatCode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/[\s_-]/g, "");
  if (compact.length !== 8) return null;
  const code = `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return PATTERN.test(code) ? code : null;
}

/** N códigos distintos entre sí (la unicidad contra la base la resuelve quien inserta). */
export function generateSeatCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateSeatCode());
  return [...codes];
}

/** Emails pegados desde Excel o uno por línea: separa, normaliza, valida y quita repetidos. */
export function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      invalid.push(part.trim());
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push(email);
  }
  return { valid, invalid };
}
