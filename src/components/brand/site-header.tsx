import Link from "next/link";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth/config";
import { signOutAction } from "@/lib/auth/actions";
import { forTenant } from "@/lib/db/tenant-scope";
import type { Tenant } from "@/lib/tenant/resolve";

export async function SiteHeader({ tenant }: { tenant: Tenant }) {
  const session = await auth();
  const membership = session?.user
    ? await forTenant(tenant.id).memberships.findByUserId(session.user.id)
    : null;

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          {tenant.logoUrl ? (
            // Logo subido por la cámara; next/image exige configurar cada
            // hostname remoto, y acá puede ser cualquiera (Blob de la cámara).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt={tenant.campusName} className="h-8 w-auto" />
          ) : (
            <span>{tenant.campusName}</span>
          )}
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/cursos" className="text-muted-foreground hover:text-foreground">
            Cursos
          </Link>
          {session?.user ? (
            <>
              {membership?.role === "tenant_admin" && (
                <Link href="/admin" className="text-muted-foreground hover:text-foreground">
                  Panel de la cámara
                </Link>
              )}
              <Link href="/mi-campus" className="text-muted-foreground hover:text-foreground">
                Mi campus
              </Link>
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm">
                  Salir
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/ingresar">Ingresar</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
