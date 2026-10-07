import { ChevronRight } from "lucide-react";

// <details>/<summary> nativos: plegable, accesible por teclado y sin JS.
export function Accordion({ children }: { children: React.ReactNode }) {
  return <div className="my-6 flex flex-col gap-2">{children}</div>;
}

export function AccordionItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        {title}
      </summary>
      <div className="border-t border-border px-4 py-3 text-[0.95em] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
    </details>
  );
}
