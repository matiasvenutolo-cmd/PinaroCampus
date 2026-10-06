import { getCurrentTenant } from "@/lib/tenant/context";

export default async function AdminDashboardPage() {
  const tenant = await getCurrentTenant();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Panel de {tenant.campusName}</h1>
      <p className="text-muted-foreground">
        El dashboard completo (KPIs, cursos, alumnos, reportes) llega en las próximas fases.
      </p>
    </div>
  );
}
