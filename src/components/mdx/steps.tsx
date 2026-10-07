export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="my-6 flex list-none flex-col gap-4 p-0 [counter-reset:step]">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <li className="relative list-none pl-12 [counter-increment:step] before:absolute before:left-0 before:top-0 before:flex before:size-8 before:items-center before:justify-center before:rounded-full before:bg-primary before:text-sm before:font-semibold before:text-primary-foreground before:content-[counter(step)]">
      <p className="m-0 font-semibold">{title}</p>
      {children ? <div className="mt-1 text-[0.95em] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div> : null}
    </li>
  );
}
