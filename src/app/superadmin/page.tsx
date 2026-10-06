import Link from "next/link";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";

export default async function SuperadminHomePage() {
  const allTenants = await db.select().from(tenants).orderBy(tenants.createdAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cámaras</h1>
        <Button asChild>
          <Link href="/superadmin/camaras/nueva">Nueva cámara</Link>
        </Button>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {allTenants.map((tenant) => (
          <Link
            key={tenant.id}
            href={`/superadmin/camaras/${tenant.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted"
          >
            <div className="flex items-center gap-3">
              <span
                className="size-3 rounded-full"
                style={{ background: tenant.theme.primary }}
                aria-hidden
              />
              <div>
                <p className="font-medium">{tenant.campusName}</p>
                <p className="text-sm text-muted-foreground">{tenant.slug}</p>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {tenant.status === "active" ? "Activa" : "Suspendida"}
              {tenant.isDemo ? " · demo" : ""}
            </span>
          </Link>
        ))}
        {allTenants.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Todavía no hay cámaras.</p>
        )}
      </div>
    </div>
  );
}
