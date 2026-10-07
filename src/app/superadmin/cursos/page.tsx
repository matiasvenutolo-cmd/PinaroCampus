import { eq } from "drizzle-orm";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { courses, tenantCourses, tenants } from "@/lib/db/schema";
import { formatDate, formatDuration } from "@/lib/format";

import { syncCoursesNow } from "./actions";

export default async function SuperadminCoursesPage({ searchParams }: { searchParams: Promise<{ sync?: string }> }) {
  const { sync } = await searchParams;
  const [allCourses, assignments] = await Promise.all([
    db.select().from(courses).orderBy(courses.title),
    db
      .select({ courseId: tenantCourses.courseId, tenantName: tenants.shortName })
      .from(tenantCourses)
      .innerJoin(tenants, eq(tenants.id, tenantCourses.tenantId)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Biblioteca de cursos</h1>
        <form action={syncCoursesNow}>
          <Button type="submit" variant="outline">
            Sincronizar ahora
          </Button>
        </form>
      </div>
      {sync === "ok" ? <p className="text-sm text-success">Sincronizado.</p> : null}
      {sync?.startsWith("invalidos") ? (
        <p role="alert" className="text-sm text-danger">Hay cursos con errores: corré `pnpm courses:validate` para ver el detalle.</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Curso</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Versión</th>
              <th className="px-4 py-2 font-medium">Sincronizado</th>
              <th className="px-4 py-2 font-medium">Asignado a</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allCourses.map((course) => (
              <tr key={course.id}>
                <td className="px-4 py-3">
                  <Link href={`/superadmin/cursos/${course.slug}`} className="font-medium hover:underline">
                    {course.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{course.slug} · {formatDuration(course.durationMinutes)}</p>
                </td>
                <td className="px-4 py-3">{course.status}</td>
                <td className="px-4 py-3 font-mono text-xs">{course.contentHash.slice(0, 8)}</td>
                <td className="px-4 py-3">{formatDate(course.syncedAt)}</td>
                <td className="px-4 py-3">
                  {assignments.filter((a) => a.courseId === course.id).map((a) => a.tenantName).join(", ") || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
