import Link from "next/link";

import type { Tenant } from "@/lib/tenant/resolve";

export function SiteFooter({ tenant }: { tenant: Tenant }) {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted-foreground">
        <p>{tenant.contactEmail}</p>
        <div className="flex gap-4">
          <Link href="/legal/privacidad" className="hover:text-foreground">
            Privacidad
          </Link>
          <Link href="/legal/terminos" className="hover:text-foreground">
            Términos
          </Link>
          {tenant.websiteUrl && (
            <a href={tenant.websiteUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
              Sitio de la cámara
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground/70">Plataforma provista por Pinaro</p>
      </div>
    </footer>
  );
}
