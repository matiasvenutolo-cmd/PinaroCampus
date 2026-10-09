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
            // Logo de la cámara (alto pensado para que un logo apaisado no baje de ~95 px de ancho, como pide el manual de marca de ADS); next/image exige configurar cada
            // hostname remoto, y acá puede ser cualquiera (Blob de la cámara).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt={tenant.campusName} className="h-11 w-auto sm:h-[52px]" />
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
              <Link href="/mi-campus/certificados" className="hidden text-muted-foreground hover:text-foreground sm:inline">
                Mis certificados
              </Link>
              <Link href="/mis-compras" className="hidden text-muted-foreground hover:text-foreground md:inline">
                Mis compras
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
