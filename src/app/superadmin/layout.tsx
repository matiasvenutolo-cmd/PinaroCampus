import Link from "next/link";

import { requireSuperadmin } from "@/lib/auth/permissions";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin();

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="border-b border-border px-4 py-3"
        style={{ background: "linear-gradient(135deg, #22D3EE 0%, #8B5CF6 50%, #F472B6 100%)" }}
      >
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <Link href="/superadmin" className="font-semibold text-white">
            Pinaro · Superadmin
          </Link>
          <nav className="flex gap-4 text-sm text-white">
            <Link href="/superadmin" className="hover:underline">Cámaras</Link>
            <Link href="/superadmin/cursos" className="hover:underline">Cursos</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
