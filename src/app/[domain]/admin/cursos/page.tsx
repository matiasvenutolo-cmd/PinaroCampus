import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatCents } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

import { enrollStudentByEmail } from "./actions";

export const metadata = { title: "Cursos de la cámara" };

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  "email-invalido": { text: "Revisá el email.", error: true },
  curso: { text: "Ese curso no está publicado.", error: true },
  "sin-alumno": { text: "Ese email todavía no ingresó a la plataforma: tiene que entrar una vez con su email.", error: true },
  inscripto: { text: "Alumno inscripto.", error: false },
  "ya-inscripto": { text: "Ese alumno ya estaba inscripto.", error: false },
};

export default async function AdminCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ error?: string; ok?: string; curso?: string }>;
}) {
  const { domain } = await params;
  const { error, ok, curso } = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const scoped = forTenant(tenant.id);
  const [assigned, counts] = await Promise.all([scoped.catalog.listAssigned(), scoped.enrollments.countByCourse()]);
  const enrolledByCourse = new Map(counts.map((c) => [c.courseId, c.total]));
  const message = MESSAGES[error ?? ok ?? ""];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Cursos de {tenant.campusName}</h1>
      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {assigned.map((course) => (
          <li key={course.courseId} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{course.title}</p>
                <p className="text-sm text-muted-foreground">
                  {course.status === "published" ? "Publicado" : "Próximamente"} · {course.categoryName ?? "Sin categoría"} · socio{" "}
                  {formatCents(course.priceMemberCents)} / no socio {formatCents(course.priceNonMemberCents)}
                </p>
              </div>
              <p className="text-sm tabular-nums text-muted-foreground">{enrolledByCourse.get(course.courseId) ?? 0} inscriptos</p>
            </div>

            {course.status === "published" ? (
              <form action={enrollStudentByEmail.bind(null, course.slug)} className="mt-3 flex items-end gap-2">
                <div className="flex max-w-sm flex-1 flex-col gap-1.5">
                  <Label htmlFor={`email-${course.slug}`} className="text-xs">
                    Inscribir a mano (email del alumno)
                  </Label>
                  <Input id={`email-${course.slug}`} name="email" type="email" required defaultValue={curso === course.slug ? "" : undefined} />
                </div>
                <Button type="submit" variant="outline">
                  Inscribir
                </Button>
              </form>
            ) : null}
          </li>
        ))}
        {assigned.length === 0 ? <li className="text-sm text-muted-foreground">Todavía no hay cursos asignados a la cámara.</li> : null}
      </ul>
    </div>
  );
}
