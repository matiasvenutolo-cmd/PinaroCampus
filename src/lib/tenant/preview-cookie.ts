import { hmacBase64Url } from "@/lib/web-hmac";

// Cookie firmada de "ver como" (docs/02-arquitectura.md).
export const PREVIEW_COOKIE_NAME = "pc_preview_tenant";
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2; // 2 horas

export async function signPreviewCookie(slug: string): Promise<string> {
  const expires = Date.now() + PREVIEW_COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = `${slug}.${expires}`;
  return `${payload}.${await hmacBase64Url(payload)}`;
}

/** Devuelve el slug si la cookie es válida y no venció; `null` si no. */
export async function verifyPreviewCookie(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [slug, expiresRaw, signatureRaw] = parts;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;

  const expectedSignature = await hmacBase64Url(`${slug}.${expiresRaw}`);
  return expectedSignature === signatureRaw ? slug : null;
}
