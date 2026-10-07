import { Award, BookOpenCheck, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryIcon } from "@/components/catalog/category-icon";
import { CourseCard } from "@/components/catalog/course-card";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { forTenant } from "@/lib/db/tenant-scope";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

const STEPS = [
  { icon: BookOpenCheck, title: "Elegí un curso", text: "Mirá el catálogo y quedate con el que más te sirve." },
  { icon: MonitorSmartphone, title: "Cursá a tu ritmo", text: "Desde cualquier dispositivo, cuando tengas un rato." },
  { icon: Award, title: "Obtené tu certificado", text: "Con un código que cualquiera puede verificar." },
] as const;

export default async function TenantHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const scoped = forTenant(tenant.id);
  const [viewer, categories, counts, featured, all] = await Promise.all([
    getViewer(tenant),
    scoped.categories.list(),
    scoped.catalog.countByCategory(),
    scoped.catalog.featured(3),
    scoped.catalog.list(),
  ]);
  const tier = viewer?.tier ?? "non_member";
  const memberPricing = tenant.memberValidationMode !== "open";
  const countByCategory = new Map(counts.map((c) => [c.categoryId, c.total]));
  const visibleCategories = categories.filter((c) => (countByCategory.get(c.id) ?? 0) > 0);
  const highlighted = featured.length > 0 ? featured : all.slice(0, 3);

  return (
    <div className="flex flex-col">
      <section className="px-4 py-16 text-center sm:py-24" style={{ background: "linear-gradient(180deg, var(--primary-soft), transparent)" }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <h1 className="text-balance text-3xl font-semibold sm:text-4xl">
            {tenant.homeContent.heroTitle ?? `Capacitación para las empresas de ${tenant.name}`}
          </h1>
          <p className="text-balance text-muted-foreground sm:text-lg">
            {tenant.homeContent.heroSubtitle ?? "Cursos prácticos para tu equipo. Cursá a tu ritmo y obtené un certificado verificable."}
          </p>
          <Button asChild size="lg" className="mt-2 h-10 px-5 text-base">
            <Link href="/cursos">{tenant.homeContent.heroCtaLabel ?? "Ver cursos"}</Link>
          </Button>
        </div>
      </section>

      {visibleCategories.length > 0 ? (
        <section className="mx-auto w-full max-w-[1200px] px-4 py-10">
          <h2 className="mb-4 text-xl font-semibold">Categorías</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {visibleCategories.map((category) => (
              <Link
                key={category.id}
                href={`/cursos?categoria=${category.slug}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-9 items-center justify-center rounded-lg text-primary" style={{ background: "var(--primary-soft)" }}>
                  <CategoryIcon name={category.icon} className="size-5" />
                </span>
                <span className="text-sm font-medium leading-snug">{category.name}</span>
                <span className="text-xs text-muted-foreground">
                  {countByCategory.get(category.id)} {countByCategory.get(category.id) === 1 ? "curso" : "cursos"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {highlighted.length > 0 ? (
        <section className="mx-auto w-full max-w-[1200px] px-4 py-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-semibold">Cursos destacados</h2>
            <Link href="/cursos" className="text-sm text-primary underline-offset-4 hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlighted.map((course) => (
              <CourseCard key={course.courseId} course={course} tier={tier} memberPricing={memberPricing} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <h2 className="mb-4 text-xl font-semibold">Cómo funciona</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <step.icon className="size-4 text-primary" aria-hidden />
                  {step.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {memberPricing ? (
        <section className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-4">
          <div className="rounded-xl border border-border p-6 text-center" style={{ background: "var(--primary-soft)" }}>
            <p className="font-medium">¿Tu empresa es socia de {tenant.shortName}?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Si tu empresa es socia de la cámara, accedés a precios preferenciales.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
