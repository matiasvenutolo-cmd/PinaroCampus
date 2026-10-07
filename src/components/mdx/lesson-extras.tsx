import { Download as DownloadIcon } from "lucide-react";

export function DownloadButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="my-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
    >
      <DownloadIcon className="size-4 text-primary" aria-hidden />
      {label}
    </a>
  );
}

export function LessonFigure({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="my-6">
      {/* Imagen del curso servida por /api/course-files; next/image exigiría configurar dominios. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="mx-auto h-auto max-w-full rounded-lg border border-border" />
      {caption ? <figcaption className="mt-2 text-center text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

export function ScrollTable(props: React.ComponentProps<"table">) {
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table {...props} className="w-full border-collapse text-sm" />
    </div>
  );
}
