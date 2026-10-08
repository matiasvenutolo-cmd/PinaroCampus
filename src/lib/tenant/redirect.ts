import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { schemeFor } from "./urls";

/**
 * Redirect a un path de la MISMA cámara desde un route handler. `request.url`
 * trae el host interno después del rewrite del proxy (`localhost:3000`), así
 * que el origen se arma con el host real que resolvió el proxy.
 */
export async function redirectToPath(path: string): Promise<NextResponse> {
  const list = await headers();
  const host = list.get("x-pc-host") ?? list.get("host") ?? "localhost:3000";
  const scheme = list.get("x-forwarded-proto") ?? schemeFor(host);
  return NextResponse.redirect(`${scheme}://${host}${path.startsWith("/") ? path : `/${path}`}`);
}
