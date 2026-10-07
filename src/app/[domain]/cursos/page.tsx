import { Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseCard } from "@/components/catalog/course-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getViewer } from "@/lib/auth/viewer";
import { forTenant } from "@/lib/db/tenant-scope";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cursos" };

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ categoria?: string; q?: string }>;
}) {
  const { domain } = await params;
  const { categoria, q } = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const scoped = forTenant(tenant.id);
  const category = categoria ? await scoped.categories.findBySlug(categoria) : null;
  const viewer = await getViewer(tenant);
  const [categories, courses, myEnrollments] = await Promise.all([
    scoped.categories.list(),
    scoped.catalog.list({ categoryId: category?.id, q }),
    viewer ? scoped.enrollments.listForUser(viewer.user.id) : Promise.resolve([]),
  ]);

  const enrollmentByCourse = new Map(myEnrollments.map((e) => [e.courseId, e.status]));
  const memberPricing = tenant.memberValidationMode !== "open";
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
      <h1 className="text-2xl font-semibold">Cursos</h1>

      <form action="/cursos" className="mt-4 flex gap-2" role="search">
        {category ? <input type="hidden" name="categoria" value={category.slug} /> : null}
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q ?? ""} placeholder="Buscá un curso" aria-label="Buscar cursos" className="pl-8" />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <nav aria-label="Categorías" className="mt-4 flex flex-wrap gap-2">
        <Link href={q ? `/cursos?q=${encodeURIComponent(q)}` : "/cursos"} className={chip(!category)}>
          Todas
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/cursos?categoria=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={chip(category?.id === c.id)}
            aria-current={category?.id === c.id ? "true" : undefined}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      {courses.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">No encontramos cursos con ese filtro</p>
          <p className="mt-1 text-sm text-muted-foreground">Probá con otra búsqueda o mirá todas las categorías.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/cursos">Ver todos los cursos</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const status = enrollmentByCourse.get(course.courseId);
            return (
              <CourseCard
                key={course.courseId}
                course={course}
                tier={viewer?.tier ?? "non_member"}
                memberPricing={memberPricing}
                enrollmentStatus={status === "active" || status === "completed" ? status : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
