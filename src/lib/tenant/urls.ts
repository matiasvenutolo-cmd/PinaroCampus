import "server-only";

import { getPrimaryHost } from "./resolve";

/** `http` solo para desarrollo local (`*.localhost`); todo lo demás es https. */
export function schemeFor(host: string): "http" | "https" {
  const hostname = host.split(":")[0];
  return hostname === "localhost" || hostname.endsWith(".localhost") ? "http" : "https";
}

/** URL absoluta en el dominio primario de la cámara (emails, QR, certificados). */
export async function buildTenantUrl(tenantId: string, path: string): Promise<string> {
  const host = (await getPrimaryHost(tenantId)) ?? "localhost:3000";
  return `${schemeFor(host)}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}
