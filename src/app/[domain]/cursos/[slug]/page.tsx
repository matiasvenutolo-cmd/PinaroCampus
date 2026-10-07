import { Award, CircleCheck, ClipboardCheck, Clock, FileText, Layers, Paperclip, Video } from "lucide-react";
import { notFound } from "next/navigation";

import { CourseCover } from "@/components/catalog/course-cover";
import { CourseCta } from "@/components/catalog/course-cta";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth/config";
import { getViewer } from "@/lib/auth/viewer";
import { getCourseAccess } from "@/lib/courses/access";
import { flattenLessons, getCourseStructure } from "@/lib/courses/structure";
import { forTenant } from "@/lib/db/tenant-scope";
import { formatDuration, formatNumber } from "@/lib/format";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";

const LEVEL_LABEL = { inicial: "Nivel inicial", intermedio: "Nivel intermedio", avanzado: "Nivel avanzado" } as const;
const TYPE_ICON = { text: FileText, video: Video, resource: Paperclip, quiz: ClipboardCheck, exam: ClipboardCheck } as const;
const TYPE_LABEL = { text: "Lectura", video: "Video", resource: "Recursos", quiz: "Repaso", exam: "Examen final" } as const;

type Params = Promise<{ domain: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { domain, slug } = await params;
  const tenant = await resolveTenantFromDomainParam(domain);
  const course = tenant ? await forTenant(tenant.id).catalog.findBySlug(slug) : null;
  return { title: course?.title ?? "Curso", description: course?.subtitle };
}

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ error?: string; espera?: string }>;
}) {
  const { domain, slug } = await params;
  const { error, espera } = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const session = await auth();
  const viewer = await getViewer(tenant);
  const access = session?.user?.id ? await getCourseAccess(tenant.id, session.user.id, slug) : null;
  const course = access?.tenantCourse ?? (await forTenant(tenant.id).catalog.findBySlug(slug));
  const enrollment = access?.enrollment ?? null;

  if (!course || (course.status !== "published" && course.status !== "coming_soon")) notFound();
  if (course.visibility === "hidden" && !enrollment) notFound();

  const structure = await getCourseStructure(course.courseId);
  const lessonCount = flattenLessons(structure).filter((l) => l.type !== "quiz" && l.type !== "exam").length;
  const tier = viewer?.tier ?? "non_member";
  const memberPricing = tenant.memberValidationMode !== "open";
  const meta = course.meta;
  const hours = Number(course.certificateHours);

  const alreadyOnWaitlist =
    viewer && course.status === "coming_soon"
      ? await forTenant(tenant.id).waitlist.has(course.courseId, viewer.user.email)
      : false;
  const waitlistState =
    espera === "ok" ? "ok" : espera === "email-invalido" ? "email-invalido" : alreadyOnWaitlist ? "ya-anotado" : null;

  const ctaProps = {
    course,
    tier,
    memberPricing,
    loggedIn: Boolean(session?.user),
    enrolled: Boolean(enrollment),
    progressPct: enrollment?.progressPct ?? 0,
    contactEmail: tenant.contactEmail,
    error,
    waitlistState,
    viewerEmail: viewer?.user.email ?? "",
  } as const;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-8 lg:pb-12">
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-xl">
            <CourseCover title={course.title} categoryIcon={course.categoryIcon} coverUrl={course.coverUrl} showTitle className="aspect-[21/9]" />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {course.categoryName ? <p className="text-sm font-medium text-primary">{course.categoryName}</p> : null}
            {course.status === "coming_soon" ? <Badge variant="secondary">Próximamente</Badge> : null}
          </div>
          <h1 className="mt-1 text-balance text-3xl font-semibold">{course.title}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{course.subtitle}</p>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{formatDuration(course.durationMinutes)}</li>
            <li className="flex items-center gap-1.5"><Layers className="size-4" aria-hidden />{lessonCount} lecciones · {LEVEL_LABEL[course.level]}</li>
            {meta.certificate.enabled && hours > 0 ? (
              <li className="flex items-center gap-1.5"><Award className="size-4" aria-hidden />Certificado de {formatNumber(hours, 1)} h</li>
            ) : null}
          </ul>

          <div className="mt-6 flex flex-col gap-3 leading-7">
            {course.description.split("\n\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {meta.outcomes.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Qué vas a aprender</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {meta.outcomes.map((outcome) => (
                  <li key={outcome} className="flex items-start gap-2 text-sm">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {outcome}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Temario</h2>
            <div className="mt-3 flex flex-col gap-2">
              {structure.map((module, index) => (
                <details key={module.id} className="group rounded-xl border border-border bg-card" open={index === 0 && structure.length <= 3}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                    <span>
                      <span className="block text-xs text-muted-foreground">Módulo {index + 1}</span>
                      <span className="font-medium">{module.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{module.lessons.length} lecciones</span>
                  </summary>
                  <ul className="divide-y divide-border border-t border-border">
                    {module.lessons.map((lesson) => {
                      const Icon = TYPE_ICON[lesson.type];
                      return (
                        <li key={lesson.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">{lesson.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {TYPE_LABEL[lesson.type]}{lesson.durationMinutes > 0 ? ` · ${formatDuration(lesson.durationMinutes)}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          {meta.audience.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">A quién está dirigido</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{meta.audience.map((a) => <li key={a}>{a}</li>)}</ul>
            </section>
          ) : null}

          {meta.prerequisites.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Requisitos</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{meta.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>
            </section>
          ) : null}

          {meta.instructors.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Docentes</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {meta.instructors.map((i) => (
                  <li key={i.name} className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium">{i.name}</p>
                    {i.bio ? <p className="mt-1 text-sm text-muted-foreground">{i.bio}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {meta.certificate.enabled ? (
            <section className="mt-8 rounded-xl border border-border p-4" style={{ background: "var(--primary-soft)" }}>
              <p className="flex items-center gap-2 font-medium"><Award className="size-5 text-primary" aria-hidden />Certificado incluido</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Al aprobar el curso recibís un certificado de {tenant.name} con un código que se puede verificar en línea.
              </p>
            </section>
          ) : null}
        </div>

        <aside>
          <div className="lg:sticky lg:top-6">
            <CourseCta {...ctaProps} variant="card" />
          </div>
        </aside>
      </div>

      <CourseCta {...ctaProps} variant="bar" />
    </div>
  );
}
