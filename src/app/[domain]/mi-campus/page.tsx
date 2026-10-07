import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryIcon } from "@/components/catalog/category-icon";
import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/permissions";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDuration } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

export const metadata = { title: "Mi campus" };

type Item = Awaited<ReturnType<ReturnType<typeof forTenant>["enrollments"]["listForUser"]>>[number];

function EnrollmentCard({ item }: { item: Item }) {
  const completed = item.status === "completed";
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-primary" style={{ background: "var(--primary-soft)" }}>
          <CategoryIcon name={item.categoryIcon} className="size-5" />
        </span>
        <div className="min-w-0">
          <Link href={`/cursos/${item.slug}`} className="font-medium leading-snug hover:underline">
            {item.title}
          </Link>
          <p className="text-xs text-muted-foreground">{formatDuration(item.durationMinutes)}</p>
        </div>
      </div>
      <div>
        <div
          role="progressbar"
          aria-label={`Avance de ${item.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={item.progressPct}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${item.progressPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{completed ? "Completado" : `${item.progressPct}% completado`}</p>
      </div>
      <Button asChild variant={completed ? "outline" : "default"} className="mt-auto w-full">
        <Link href={`/aprender/${item.slug}`}>{completed ? "Repasar" : item.progressPct > 0 ? "Continuar" : "Empezar"}</Link>
      </Button>
    </li>
  );
}

export default async function MiCampusPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();
  const { user } = await requireMembership(tenant.id);

  const items = await forTenant(tenant.id).enrollments.listForUser(user.id);
  const inProgress = items.filter((i) => i.status === "active");
  const done = items.filter((i) => i.status === "completed");
  const resume = inProgress.find((i) => i.lastLessonKey) ?? inProgress[0];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
      <h1 className="text-2xl font-semibold">Hola, {user.name ?? user.email}</h1>

      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full text-primary" style={{ background: "var(--primary-soft)" }}>
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <p className="font-medium">Todavía no te inscribiste en ningún curso</p>
          <p className="text-sm text-muted-foreground">Mirá el catálogo y elegí el primero.</p>
          <Button asChild className="mt-2">
            <Link href="/cursos">Ver cursos</Link>
          </Button>
        </div>
      ) : (
        <>
          {resume ? (
            <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-5" style={{ background: "var(--primary-soft)" }}>
              <div>
                <p className="text-sm text-muted-foreground">Seguí donde dejaste</p>
                <p className="text-lg font-semibold">{resume.title}</p>
              </div>
              <Button asChild size="lg" className="h-10">
                <Link href={`/aprender/${resume.slug}`}>Continuar · {resume.progressPct}%</Link>
              </Button>
            </section>
          ) : null}

          {inProgress.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">En curso</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{inProgress.map((i) => <EnrollmentCard key={i.enrollmentId} item={i} />)}</ul>
            </section>
          ) : null}

          {done.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">Completados</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{done.map((i) => <EnrollmentCard key={i.enrollmentId} item={i} />)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
