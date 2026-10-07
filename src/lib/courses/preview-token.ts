import { hmacBase64Url } from "@/lib/web-hmac";

// Link de vista previa de un curso para docentes (docs/07, Fase 2):
// /preview/<slug>/<lessonKey>?token=... con vencimiento de 14 días.
export const PREVIEW_TOKEN_DAYS = 14;

export async function signCoursePreviewToken(slug: string): Promise<string> {
  const expires = Date.now() + PREVIEW_TOKEN_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await hmacBase64Url(`course-preview:${slug}:${expires}`)}`;
}

export async function verifyCoursePreviewToken(slug: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiresRaw, signature] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  return (await hmacBase64Url(`course-preview:${slug}:${expiresRaw}`)) === signature;
}
