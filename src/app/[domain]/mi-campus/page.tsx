import { requireMembership } from "@/lib/auth/permissions";
import { getCurrentTenant } from "@/lib/tenant/context";

export default async function MiCampusPage() {
  const tenant = await getCurrentTenant();
  const { user } = await requireMembership(tenant.id);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-2 px-4 py-16">
      <h1 className="text-2xl font-semibold">Hola, {user.name ?? user.email}</h1>
      <p className="text-muted-foreground">
        Ya sos parte de {tenant.campusName}. Los cursos están por llegar — volvé pronto.
      </p>
    </div>
  );
}
