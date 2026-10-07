import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getCourseAccess } from "@/lib/courses/access";
import { resolveCourseFile } from "@/lib/courses/files";
import { verifyCoursePreviewToken } from "@/lib/courses/preview-token";
import { forTenant } from "@/lib/db/tenant-scope";
import { getTenantByHost } from "@/lib/tenant/resolve";

// Archivos de content/courses/<slug>/. `assets/` y la portada son públicos
// (imágenes de las lecciones); `resources/` (descargables) solo para inscriptos,
// admins de la cámara, superadmin o con un token de vista previa válido.
const MIME: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const notFound = () => new NextResponse("No encontrado", { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path: segments } = await params;
  const relative = segments.join("/");
  const [first] = segments;

  const isCover = segments.length === 1 && first.startsWith("cover.");
  const isAsset = first === "assets";
  const isResource = first === "resources";
  if (!isCover && !isAsset && !isResource) return notFound();

  const host = request.headers.get("x-pc-host");
  const tenant = host ? await getTenantByHost(host) : null;
  if (!tenant) return notFound();

  if (isResource) {
    const token = new URL(request.url).searchParams.get("token");
    let allowed = await verifyCoursePreviewToken(slug, token);
    if (!allowed) {
      const session = await auth();
      const userId = session?.user?.id;
      if (userId) {
        const access = await getCourseAccess(tenant.id, userId, slug);
        const membership = await forTenant(tenant.id).memberships.findByUserId(userId);
        allowed = Boolean(access?.enrollment) || membership?.role === "tenant_admin" || Boolean(session.user.isSuperadmin);
      }
    }
    if (!allowed) return new NextResponse("No autorizado", { status: 403 });
  }

  let file: Buffer;
  try {
    file = await readFile(/*turbopackIgnore: true*/ resolveCourseFile(slug, relative));
  } catch {
    return notFound();
  }

  const extension = path.extname(relative).toLowerCase();
  const headers = new Headers({
    "Content-Type": MIME[extension] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": isResource ? "private, max-age=300" : "public, max-age=3600",
  });
  if (extension === ".svg") headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  if (isResource) headers.set("Content-Disposition", `attachment; filename="${path.basename(relative)}"`);

  return new NextResponse(new Uint8Array(file), { headers });
}
