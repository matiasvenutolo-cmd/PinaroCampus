import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { flattenLessons, getCourseBySlug, getCourseStructure } from "@/lib/courses/structure";
import { db } from "@/lib/db";
import { categories, tenantCourses, tenants } from "@/lib/db/schema";

import { generatePreviewLink, saveCourseAssignment } from "../actions";

const selectClass = "h-8 rounded-lg border border-border bg-background px-2.5 text-sm";

export default async function SuperadminCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string; preview?: string }>;
}) {
  const { slug } = await params;
  const { ok, error, preview } = await searchParams;
  const course = await getCourseBySlug(slug);
  if (!course) notFound();

  const [allTenants, allCategories, assignments, structure] = await Promise.all([
    db.select().from(tenants).orderBy(tenants.name),
    db.select().from(categories).orderBy(categories.sortOrder),
    db.select().from(tenantCourses).where(eq(tenantCourses.courseId, course.id)),
    getCourseStructure(course.id),
  ]);
  const firstLesson = flattenLessons(structure)[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/superadmin/cursos" className="text-sm text-muted-foreground hover:underline">← Biblioteca</Link>
        <h1 className="mt-1 text-2xl font-semibold">{course.title}</h1>
        <p className="text-sm text-muted-foreground">
          {course.slug} · {course.status} · versión {course.contentHash.slice(0, 8)} · {flattenLessons(structure).length} lecciones
        </p>
      </div>
      {ok ? <p className="text-sm text-success">Guardado.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">Revisá los datos del formulario.</p> : null}

      <Card>
        <CardHeader><CardTitle>Vista previa para docentes</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Un link firmado, sin cuenta, que vence a los 14 días. Es de solo lectura.</p>
          {firstLesson ? (
            <form action={generatePreviewLink.bind(null, course.slug, firstLesson.key)}>
              <Button type="submit" variant="outline">Generar link</Button>
            </form>
          ) : null}
          {preview ? <Input readOnly value={preview} aria-label="Link de vista previa" /> : null}
        </CardContent>
      </Card>

      {allTenants.map((tenant) => {
        const assignment = assignments.find((a) => a.tenantId === tenant.id);
        const tenantCategories = allCategories.filter((c) => c.tenantId === tenant.id);
        const id = (field: string) => `${tenant.slug}-${field}`;
        return (
          <Card key={tenant.id}>
            <CardHeader>
              <CardTitle>
                {tenant.campusName}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {assignment ? (assignment.publishedAt ? "· publicado" : "· asignado, sin publicar") : "· sin asignar"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveCourseAssignment.bind(null, course.slug, tenant.id)} className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={id("categoryId")}>Categoría</Label>
                  <select id={id("categoryId")} name="categoryId" defaultValue={assignment?.categoryId ?? ""} className={selectClass}>
                    <option value="">Sin categoría</option>
                    {tenantCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={id("visibility")}>Visibilidad</Label>
                  <select id={id("visibility")} name="visibility" defaultValue={assignment?.visibility ?? "public"} className={selectClass}>
                    <option value="public">Pública</option>
                    <option value="members_only">Solo socios pueden comprar</option>
                    <option value="hidden">Oculta del catálogo</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={id("priceMember")}>Precio socio ($)</Label>
                  <Input id={id("priceMember")} name="priceMember" type="number" min={0} step="1" required defaultValue={assignment ? assignment.priceMemberCents / 100 : 0} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={id("priceNonMember")}>Precio no socio ($)</Label>
                  <Input id={id("priceNonMember")} name="priceNonMember" type="number" min={0} step="1" required defaultValue={assignment ? assignment.priceNonMemberCents / 100 : 0} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={id("accessDays")}>Días de acceso (vacío = sin vencimiento)</Label>
                  <Input id={id("accessDays")} name="accessDays" type="number" min={1} defaultValue={assignment?.accessDays ?? ""} />
                </div>
                <fieldset className="flex flex-col gap-2 text-sm sm:justify-end">
                  <label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={Boolean(assignment?.publishedAt)} /> Publicado en el catálogo</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={assignment?.isFeatured ?? false} /> Destacado</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="enrollmentOpen" defaultChecked={assignment?.enrollmentOpen ?? true} /> Inscripción abierta</label>
                </fieldset>
                <div className="sm:col-span-2">
                  <Button type="submit">{assignment ? "Guardar" : "Asignar a la cámara"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
