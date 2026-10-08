import "server-only";

import { cookies } from "next/headers";

// A dónde volver después de ingresar (y de completar el onboarding si es la
// primera vez): lo usan las compras y el canje de vacantes, que arrancan antes
// de que la persona tenga sesión. Cookie corta, httpOnly, solo paths propios.
const COOKIE = "pc_return";
const MAX_AGE_SECONDS = 30 * 60;

/** Solo paths relativos de este mismo sitio (nada de `//otro.com` ni `\\`). */
export function isSafeReturnPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && path.length <= 300;
}

/** Solo desde server actions y route handlers (los únicos que pueden escribir cookies). */
export async function setReturnTo(path: string) {
  if (!isSafeReturnPath(path)) return;
  (await cookies()).set(COOKIE, path, { httpOnly: true, sameSite: "lax", path: "/", maxAge: MAX_AGE_SECONDS });
}

export async function peekReturnTo(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value && isSafeReturnPath(value) ? value : null;
}

/** Lee y borra. Solo desde server actions y route handlers. */
export async function consumeReturnTo(): Promise<string | null> {
  const value = await peekReturnTo();
  if (value) (await cookies()).delete(COOKIE);
  return value;
}
