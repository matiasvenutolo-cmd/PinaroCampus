import { Factory, Info, Lightbulb, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  info: { icon: Info, box: "border-primary/30 bg-[var(--primary-soft)]", iconColor: "text-primary" },
  tip: { icon: Lightbulb, box: "border-success/30 bg-success/10", iconColor: "text-success" },
  warning: { icon: TriangleAlert, box: "border-warning/40 bg-warning/10", iconColor: "text-warning" },
  case: { icon: Factory, box: "border-border bg-muted", iconColor: "text-foreground" },
} as const;

export function Callout({
  type = "info",
  title,
  children,
}: {
  type?: keyof typeof VARIANTS;
  title?: string;
  children: React.ReactNode;
}) {
  const variant = VARIANTS[type] ?? VARIANTS.info;
  const Icon = variant.icon;
  return (
    <aside className={cn("my-6 rounded-xl border p-4", variant.box)}>
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <Icon className={cn("size-5 shrink-0", variant.iconColor)} strokeWidth={1.75} aria-hidden />
        {title ? <span>{title}</span> : null}
      </div>
      <div className="callout-body text-[0.95em] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </aside>
  );
}
