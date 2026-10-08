import Link from "next/link";

const ITEMS = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/cursos", label: "Cursos" },
  { href: "/admin/ordenes", label: "Órdenes", badge: "orders" },
  { href: "/admin/vacantes", label: "Vacantes" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/socios", label: "Socios pendientes", badge: "members" },
  { href: "/admin/certificados", label: "Certificados" },
] as const;

/** Navegación del panel de la cámara; los números son lo que está esperando una acción del admin. */
export function AdminNav({ pendingTransfers, pendingMembers }: { pendingTransfers: number; pendingMembers: number }) {
  const badges = { orders: pendingTransfers, members: pendingMembers } as const;
  return (
    <nav aria-label="Panel de la cámara" className="border-b border-border bg-card">
      <ul className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 py-2 text-sm">
        {ITEMS.map((item) => {
          const count = "badge" in item ? badges[item.badge] : 0;
          return (
            <li key={item.href} className="shrink-0">
              <Link href={item.href} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                {item.label}
                {count > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground" aria-label={`${count} pendientes`}>
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
