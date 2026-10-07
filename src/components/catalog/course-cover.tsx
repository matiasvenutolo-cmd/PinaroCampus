import { cn } from "@/lib/utils";

import { CategoryIcon } from "./category-icon";

/**
 * Portada generada (docs/08): fondo con el color primario de la cámara, un
 * patrón geométrico sutil, el ícono de la categoría y, opcionalmente, el título.
 */
export function CourseCover({
  title,
  categoryIcon,
  coverUrl,
  showTitle = false,
  className,
}: {
  title: string;
  categoryIcon?: string | null;
  coverUrl?: string | null;
  showTitle?: boolean;
  className?: string;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={coverUrl} alt="" className={cn("aspect-video w-full object-cover", className)} />
    );
  }
  return (
    <div
      className={cn("relative flex aspect-video w-full flex-col justify-between overflow-hidden p-4 text-primary-foreground", className)}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 2px, transparent 2px 16px), linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)",
      }}
    >
      <CategoryIcon name={categoryIcon} className="size-8 opacity-90" />
      {showTitle ? <p className="text-balance text-lg font-semibold leading-snug">{title}</p> : null}
    </div>
  );
}
