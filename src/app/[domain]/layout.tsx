import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/brand/site-footer";
import { SiteHeader } from "@/components/brand/site-header";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { stopPreview } from "@/lib/tenant/preview-actions";
import { cssVariablesToStyleTag, tenantThemeToCssVariables } from "@/lib/tenant/theme";

type Params = Promise<{ domain: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) return {};

  return {
    title: { default: tenant.campusName, template: `%s · ${tenant.campusName}` },
    description: tenant.homeContent.heroSubtitle,
    icons: tenant.faviconUrl ? [{ url: tenant.faviconUrl }] : undefined,
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const isPreview = domain.startsWith("__slug__");
  const styleTag = cssVariablesToStyleTag(tenantThemeToCssVariables(tenant.theme));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleTag }} />
      <div className="flex min-h-full flex-col">
        {isPreview && (
          <div className="flex items-center justify-center gap-3 bg-[#171717] px-4 py-2 text-sm text-white">
            <span>Estás viendo como {tenant.campusName} (modo superadmin)</span>
            <form action={stopPreview}>
              <Button type="submit" size="xs" variant="secondary">
                Salir
              </Button>
            </form>
          </div>
        )}
        <SiteHeader tenant={tenant} />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter tenant={tenant} />
      </div>
    </>
  );
}
