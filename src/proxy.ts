import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { PREVIEW_COOKIE_NAME, verifyPreviewCookie } from "@/lib/tenant/preview-cookie";
import { hmacBase64Url } from "@/lib/web-hmac";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

const HOST_HEADER = "x-pc-host";
const HOST_SIGNATURE_HEADER = "x-pc-host-sig";

/**
 * Cuando una server action hace `redirect()`, Next resuelve el destino con un
 * fetch interno contra el origin del server (`localhost:3000`) reenviando los
 * headers del request original. Ese fetch vuelve a pasar por este proxy con
 * `Host: localhost:3000` y perdería la cámara. Por eso el proxy firma el host
 * real (HMAC con un secreto que el cliente no tiene) en un header interno, y
 * en el fetch interno lo respeta si la firma es válida. Un request externo no
 * puede forjar la firma, así que no puede elegir tenant con un header.
 */
async function resolveRequestHost(request: NextRequest): Promise<string> {
  const host = request.headers.get("host") ?? "";
  const forwardedHost = request.headers.get(HOST_HEADER);
  const forwardedSignature = request.headers.get(HOST_SIGNATURE_HEADER);

  if (forwardedHost && forwardedSignature) {
    const expected = await hmacBase64Url(forwardedHost);
    if (expected === forwardedSignature) return forwardedHost;
  }
  return host;
}

// Resuelve el tenant por host y reescribe a /[domain]/... (docs/02-arquitectura.md).
// Antes se llamaba `middleware.ts`; Next.js 16 renombró la convención a `proxy.ts`.
export async function proxy(request: NextRequest) {
  const host = await resolveRequestHost(request);
  const { pathname, search } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(HOST_HEADER, host);
  requestHeaders.set(HOST_SIGNATURE_HEADER, await hmacBase64Url(host));

  const isApiRoute = pathname.startsWith("/api");
  const isSuperadminHost = env.SUPERADMIN_HOSTS.includes(host);

  // El panel de superadmin vive fuera de [domain]: no se reescribe.
  if (isSuperadminHost && pathname.startsWith("/superadmin")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Imágenes de marca de las cámaras (`public/brand/`): archivos estáticos, no páginas del tenant.
  if (pathname.startsWith("/brand/")) return NextResponse.next();

  // Las rutas de API y la vista previa de cursos (/preview, con token firmado,
  // fuera de [domain]) resuelven el tenant por su cuenta a partir de x-pc-host.
  if (isApiRoute || pathname.startsWith("/preview/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // "Ver como" del superadmin: solo se respeta en un host de superadmin.
  if (isSuperadminHost) {
    const previewCookie = request.cookies.get(PREVIEW_COOKIE_NAME)?.value;
    const previewSlug = await verifyPreviewCookie(previewCookie);
    if (previewSlug) {
      const tenantParam = `__slug__${previewSlug}`;
      requestHeaders.set("x-pc-tenant-param", tenantParam);
      const url = request.nextUrl.clone();
      url.pathname = `/${tenantParam}${pathname}`;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  }

  const devOverride = env.NODE_ENV === "development" ? env.DEV_TENANT_OVERRIDE : undefined;
  const effectiveHost = (devOverride || host).toLowerCase();
  requestHeaders.set("x-pc-tenant-param", effectiveHost);

  const url = request.nextUrl.clone();
  url.pathname = `/${effectiveHost}${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}
