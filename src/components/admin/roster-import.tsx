"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  confirmRosterImport,
  previewRosterImport,
  type ImportState,
} from "@/app/[domain]/admin/empresas/actions";
import { formatCuit } from "@/lib/cuit";

const IDLE: ImportState = { step: "idle" };

/** Importación del padrón en dos pasos: vista previa con errores por fila y confirmación. */
export function RosterImport() {
  const [preview, previewAction, previewing] = useActionState(previewRosterImport, IDLE);
  const [done, confirmAction, confirming] = useActionState(confirmRosterImport, IDLE);

  const result = done.step === "idle" ? preview : done;

  return (
    <section aria-label="Importar padrón" className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-semibold">Importar el padrón desde un CSV</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Columnas: <strong>CUIT</strong>, <strong>Razón social</strong>, Nombre de fantasía, Socio (sí/no) y Dominios de email (opcionales). Las empresas que ya existen se
        actualizan por CUIT.
      </p>

      {result.step !== "done" ? (
        <form action={previewAction} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="roster-file" className="text-xs">Archivo CSV</Label>
            <input id="roster-file" name="file" type="file" accept=".csv,text/csv,text/plain" className="text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="roster-csv" className="text-xs">…o pegá el contenido</Label>
            <textarea
              id="roster-csv"
              name="csv"
              rows={4}
              placeholder={"CUIT;Razón social;Socio\n30-11111111-8;Empresa Uno S.A.;sí"}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <Button type="submit" variant="outline" className="self-start" disabled={previewing}>
            {previewing ? "Revisando…" : "Ver vista previa"}
          </Button>
        </form>
      ) : null}

      {result.step === "error" ? (
        <p role="alert" className="mt-3 text-sm text-danger">{result.message}</p>
      ) : null}

      {result.step === "preview" ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            <strong>{result.valid}</strong> de {result.total} filas son válidas: <strong>{result.newCount}</strong> empresas nuevas y{" "}
            <strong>{result.updateCount}</strong> para actualizar.
            {result.errors && result.errors.length > 0 ? ` ${result.errors.length} tienen errores y no se van a importar.` : ""}
          </p>
          {result.sample && result.sample.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Línea</th>
                    <th className="px-3 py-1.5 font-medium">CUIT</th>
                    <th className="px-3 py-1.5 font-medium">Razón social</th>
                    <th className="px-3 py-1.5 font-medium">Socio</th>
                    <th className="px-3 py-1.5 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.sample.map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-1.5">{r.line}</td>
                      <td className="px-3 py-1.5 tabular-nums">{formatCuit(r.cuit)}</td>
                      <td className="px-3 py-1.5">{r.legalName}</td>
                      <td className="px-3 py-1.5">{r.isMember ? "Sí" : "No"}</td>
                      <td className="px-3 py-1.5">{r.isNew ? "Crear" : "Actualizar"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ErrorList errors={result.errors} />
          {result.valid && result.valid > 0 ? (
            <form action={confirmAction}>
              <input type="hidden" name="csv" value={result.csv} />
              <Button type="submit" disabled={confirming}>
                {confirming ? "Importando…" : `Importar ${result.valid} ${result.valid === 1 ? "empresa" : "empresas"}`}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {result.step === "done" ? (
        <div className="mt-3 flex flex-col gap-2" role="status">
          <p className="text-sm text-success">
            Listo: {result.created} {result.created === 1 ? "empresa creada" : "empresas creadas"} y {result.updated} {result.updated === 1 ? "actualizada" : "actualizadas"}.
          </p>
          <ErrorList errors={result.errors} title="Filas que no se importaron" />
          <Link href="/admin/empresas" className="w-fit text-sm text-primary underline underline-offset-4">Ver el padrón actualizado</Link>
        </div>
      ) : null}
    </section>
  );
}

function ErrorList({ errors, title = "Errores por corregir" }: { errors?: { line: number; message: string }[]; title?: string }) {
  if (!errors || errors.length === 0) return null;
  return (
    <details className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm" open>
      <summary className="cursor-pointer font-medium text-danger">
        {title} ({errors.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {errors.map((e) => (
          <li key={`${e.line}-${e.message}`}>
            Línea {e.line}: {e.message}
          </li>
        ))}
      </ul>
    </details>
  );
}
