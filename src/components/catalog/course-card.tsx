import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { CatalogCourse } from "@/lib/db/scope/courses";
import { formatDuration } from "@/lib/format";
import type { PricingTier } from "@/lib/pricing";

import { CategoryIcon } from "./category-icon";
import { CourseCover } from "./course-cover";
import { CoursePrice } from "./course-price";

const LEVEL_LABEL = { inicial: "Nivel inicial", intermedio: "Nivel intermedio", avanzado: "Nivel avanzado" } as const;

export function CourseCard({
  course,
  tier,
  memberPricing,
  enrollmentStatus,
}: {
  course: CatalogCourse;
  tier: PricingTier;
  memberPricing: boolean;
  enrollmentStatus?: "active" | "completed" | null;
}) {
  const comingSoon = course.status === "coming_soon";
  return (
    <Link
      href={`/cursos/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      style={{ borderTop: "3px solid var(--primary)" }}
    >
      <div className="relative">
        <CourseCover title={course.title} categoryIcon={course.categoryIcon} coverUrl={course.coverUrl} />
        <div className="absolute right-3 top-3 flex gap-1.5">
          {comingSoon ? <Badge variant="secondary">Próximamente</Badge> : null}
          {enrollmentStatus === "completed" ? <Badge>Completado</Badge> : null}
          {enrollmentStatus === "active" ? <Badge>Inscripto</Badge> : null}
          {!comingSoon && course.isFeatured && !enrollmentStatus ? (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              Destacado
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {course.categoryName ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <CategoryIcon name={course.categoryIcon} className="size-3.5" />
            {course.categoryName}
          </p>
        ) : null}
        <h3 className="text-base font-semibold leading-snug group-hover:underline">{course.title}</h3>
        <p className="text-xs text-muted-foreground">
          {formatDuration(course.durationMinutes)} · {LEVEL_LABEL[course.level]}
        </p>
        {!comingSoon && !enrollmentStatus ? (
          <div className="mt-auto pt-2">
            <CoursePrice
              priceMemberCents={course.priceMemberCents}
              priceNonMemberCents={course.priceNonMemberCents}
              tier={tier}
              memberPricing={memberPricing}
            />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
