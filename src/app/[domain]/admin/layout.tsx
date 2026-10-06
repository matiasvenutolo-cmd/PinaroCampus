import { requireRole } from "@/lib/auth/permissions";
import { getCurrentTenant } from "@/lib/tenant/context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();
  await requireRole(tenant.id, "tenant_admin");

  return <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8">{children}</div>;
}
