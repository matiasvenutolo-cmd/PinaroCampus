import Link from "next/link";

import { getCurrentTenant } from "@/lib/tenant/context";

export default async function AdminDashboardPage() {
  const tenant = await getCurrentTenant();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Panel de {tenant.campusName}</h1>
      <p className="text-muted-foreground">
        El dashboard completo (KPIs, alumnos, reportes) llega en las próximas fases.
      </p>
      <Link href="/admin/cursos" className="mt-2 w-fit text-primary underline-offset-4 hover:underline">
        Cursos e inscripciones
      </Link>
    </div>
  );
}
