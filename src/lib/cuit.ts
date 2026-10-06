const CHECK_DIGIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Deja solo los 11 dígitos (sin guiones ni espacios), como se guarda en `companies.cuit`. */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

export function formatCuit(cuit: string): string {
  const digits = normalizeCuit(cuit);
  if (digits.length !== 11) return cuit;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function checkDigit(first10: string): number | null {
  const sum = CHECK_DIGIT_WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(first10[i]), 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return null; // no existe como CUIT válido
  return remainder;
}

/** Valida los 11 dígitos y el dígito verificador (algoritmo módulo 11 de AFIP). */
export function isValidCuit(input: string): boolean {
  const digits = normalizeCuit(input);
  if (digits.length !== 11) return false;
  const expected = checkDigit(digits.slice(0, 10));
  return expected !== null && expected === Number(digits[10]);
}

/** Para seeds/fixtures: arma un CUIT válido a partir de 10 dígitos dados. */
export function buildValidCuit(first10: string): string {
  if (!/^\d{10}$/.test(first10)) {
    throw new Error("buildValidCuit espera exactamente 10 dígitos");
  }
  const digit = checkDigit(first10);
  if (digit === null) {
    // Desplaza el último dígito para esquivar el caso sin verificador válido.
    return buildValidCuit(first10.slice(0, 9) + String((Number(first10[9]) + 1) % 10));
  }
  return `${first10}${digit}`;
}
