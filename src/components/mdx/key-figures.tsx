export function KeyFigures({ children }: { children: React.ReactNode }) {
  return <div className="my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function KeyFigure({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" style={{ borderTop: "3px solid var(--accent)" }}>
      <p className="text-2xl font-semibold tabular-nums leading-tight text-primary">{value}</p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}
