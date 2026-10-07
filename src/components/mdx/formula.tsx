export function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-5 overflow-x-auto rounded-lg border border-border bg-muted px-4 py-3 font-mono text-[0.95em] leading-relaxed">
      {children}
    </div>
  );
}
