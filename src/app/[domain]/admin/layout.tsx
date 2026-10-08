import { AdminNav } from "@/components/admin/admin-nav";
import { requireRole } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { getCurrentTenant } from "@/lib/tenant/context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();
  await requireRole(tenant.id, "tenant_admin");

  const scoped = forTenant(tenant.id);
  const [pendingTransfers, pendingMembers] = await Promise.all([
    scoped.orders.countPendingTransfers(),
    scoped.memberships.countPending(),
  ]);

  return (
    <>
      <AdminNav pendingTransfers={pendingTransfers} pendingMembers={pendingMembers} />
      <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8">{children}</div>
    </>
  );
}
