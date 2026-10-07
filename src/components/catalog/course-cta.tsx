import Link from "next/link";

import { CoursePrice } from "@/components/catalog/course-price";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enrollInCourse, joinWaitlist } from "@/lib/courses/actions";
import type { CatalogCourse } from "@/lib/db/scope/courses";
import type { PricingTier } from "@/lib/pricing";

const ERRORS: Record<string, string> = {
  "no-disponible": "Este curso no está disponible en este momento.",
  "inscripcion-cerrada": "La inscripción a este curso está cerrada.",
  "solo-socios": "Este curso es solo para socios verificados de la cámara.",
  "pago-pendiente": "El pago online todavía no está habilitado. Escribinos y te inscribimos a mano.",
};

/** Estado de acción de un curso: continuar, inscribirse gratis, esperar el pago, lista de espera. */
export function CourseCta({
  course,
  tier,
  memberPricing,
  loggedIn,
  enrolled,
  progressPct,
  contactEmail,
  error,
  waitlistState,
  viewerEmail,
  variant,
}: {
  course: CatalogCourse;
  tier: PricingTier;
  memberPricing: boolean;
  loggedIn: boolean;
  enrolled: boolean;
  progressPct: number;
  contactEmail: string;
  error?: string;
  waitlistState: "ok" | "email-invalido" | "ya-anotado" | null;
  viewerEmail: string;
  variant: "card" | "bar";
}) {
  const comingSoon = course.status === "coming_soon";
  const price = tier === "member" ? course.priceMemberCents : course.priceNonMemberCents;
  const membersOnlyBlocked = course.visibility === "members_only" && tier !== "member";

  let action: React.ReactNode;
  let note: React.ReactNode = null;

  if (enrolled) {
    action = (
      <Button asChild size="lg" className="h-10 w-full">
        <Link href={`/aprender/${course.slug}`}>{progressPct > 0 ? "Continuar el curso" : "Empezar el curso"}</Link>
      </Button>
    );
    note = progressPct > 0 ? `Llevás ${progressPct}% del curso.` : null;
  } else if (comingSoon) {
    if (waitlistState === "ok" || waitlistState === "ya-anotado") {
      note = "Listo, te vamos a avisar apenas el curso esté disponible.";
      action = null;
    } else if (variant === "bar") {
      action = (
        <Button asChild size="lg" className="h-10 w-full">
          <Link href="#lista-de-espera">Avisame cuando esté</Link>
        </Button>
      );
    } else {
      action = (
        <form action={joinWaitlist.bind(null, course.slug)} id="lista-de-espera" className="flex flex-col gap-2">
          <Label htmlFor="waitlist-email">Tu email</Label>
          <Input id="waitlist-email" name="email" type="email" required defaultValue={viewerEmail} />
          <Label htmlFor="waitlist-company" className="mt-1">
            Empresa (opcional)
          </Label>
          <Input id="waitlist-company" name="companyName" />
          {waitlistState === "email-invalido" ? <p className="text-xs text-danger">Revisá el email.</p> : null}
          <Button type="submit" size="lg" className="mt-1 h-10 w-full">
            Avisame cuando esté
          </Button>
        </form>
      );
    }
  } else if (!course.enrollmentOpen) {
    note = ERRORS["inscripcion-cerrada"];
  } else if (membersOnlyBlocked) {
    note = ERRORS["solo-socios"];
  } else if (price > 0) {
    action = (
      <Button size="lg" className="h-10 w-full" disabled>
        Inscribirme
      </Button>
    );
    note = "El pago online se habilita pronto. Mientras tanto, escribinos a " + contactEmail + " y te inscribimos.";
  } else {
    action = (
      <form action={enrollInCourse.bind(null, course.slug)}>
        <Button type="submit" size="lg" className="h-10 w-full">
          {loggedIn ? "Inscribirme" : "Ingresar e inscribirme"}
        </Button>
      </form>
    );
  }

  const priceBlock = enrolled ? null : (
    <CoursePrice
      priceMemberCents={course.priceMemberCents}
      priceNonMemberCents={course.priceNonMemberCents}
      tier={tier}
      memberPricing={memberPricing}
      size={variant === "card" ? "lg" : "md"}
    />
  );
  const errorText = error ? ERRORS[error] : null;

  if (variant === "bar") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-border bg-card px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="min-w-0 text-sm">{priceBlock ?? <span className="text-muted-foreground">{note}</span>}</div>
        {action ? <div className="w-44 shrink-0">{action}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      {priceBlock}
      {errorText ? <p role="alert" className="text-sm text-danger">{errorText}</p> : null}
      {action}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}
