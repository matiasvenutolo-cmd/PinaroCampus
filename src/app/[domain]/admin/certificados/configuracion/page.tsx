import { notFound } from "next/navigation";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveTenantFromDomainParam } from "@/lib/tenant/context";
import { cn } from "@/lib/utils";
import { env } from "@/env";

import { saveCertificateSettings } from "./actions";

export const metadata = { title: "Firmas y texto del certificado" };

const MESSAGES: Record<string, { text: string; error: boolean }> = {
  datos: { text: "Revisá los datos: el texto de pie puede tener hasta 300 caracteres.", error: true },
  firmante: { text: "Cada firmante necesita nombre y cargo (hasta 80 caracteres).", error: true },
  url: { text: "La URL de la firma tiene que empezar con https://.", error: true },
  "sin-blob": { text: "Todavía no está configurado el almacenamiento de archivos: pegá la URL de una imagen.", error: true },
  archivo: { text: "La firma tiene que ser PNG o JPG de hasta 500 KB.", error: true },
  guardado: { text: "Guardado. Se aplica a los certificados que se emitan de ahora en más; los ya emitidos no cambian.", error: false },
};

export default async function CertificateSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { domain } = await params;
  const { ok, error } = await searchParams;
  const tenant = await resolveTenantFromDomainParam(domain);
  if (!tenant) notFound();

  const config = tenant.certificateConfig;
  const canUpload = Boolean(env.BLOB_READ_WRITE_TOKEN);
  const message = MESSAGES[error ?? ok ?? ""];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Firmas y texto del certificado</h1>
        <Link href="/admin/certificados" className="text-sm text-muted-foreground hover:text-foreground">
          ← Certificados
        </Link>
      </div>

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}

      <form action={saveCertificateSettings} className="flex flex-col gap-6">
        {[0, 1, 2].map((slot) => {
          const current = config.signatories[slot];
          return (
            <fieldset key={slot} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <legend className="px-1 text-sm font-medium">Firmante {slot + 1}{slot > 0 ? " (opcional)" : ""}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`name-${slot}`} className="text-xs">Nombre</Label>
                  <Input id={`name-${slot}`} name={`name-${slot}`} defaultValue={current?.name} maxLength={80} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`role-${slot}`} className="text-xs">Cargo</Label>
                  <Input id={`role-${slot}`} name={`role-${slot}`} defaultValue={current?.role} maxLength={80} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`url-${slot}`} className="text-xs">Imagen de la firma (URL, opcional)</Label>
                <Input id={`url-${slot}`} name={`url-${slot}`} defaultValue={current?.signatureUrl ?? ""} placeholder="https://…" />
              </div>
              {canUpload ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`file-${slot}`} className="text-xs">…o subir una imagen (PNG o JPG, fondo transparente o blanco)</Label>
                  <Input id={`file-${slot}`} name={`file-${slot}`} type="file" accept="image/png,image/jpeg" />
                </div>
              ) : null}
              {current ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name={`remove-${slot}`} className="size-4" /> Quitar la imagen de la firma
                </label>
              ) : null}
              <p className="text-xs text-muted-foreground">Dejá nombre y cargo vacíos para quitar a este firmante.</p>
            </fieldset>
          );
        })}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="footerText" className="text-sm font-medium">Texto de pie (opcional)</Label>
          <Input id="footerText" name="footerText" defaultValue={config.footerText ?? ""} maxLength={300} placeholder="Actividad de capacitación de la Cámara…" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="showDni" defaultChecked={config.showDni} className="size-4" />
          Mostrar el DNI de la persona en el certificado
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="submit">Guardar</Button>
          {/* Descarga de un PDF desde un route handler: un <a> normal, no navegación del cliente. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/certificados/configuracion/muestra" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
            Descargar una muestra
          </a>
        </div>
        <p className="text-xs text-muted-foreground">La muestra usa la configuración guardada. Guardá primero para ver los cambios.</p>
      </form>
    </div>
  );
}
