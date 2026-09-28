# CLAUDE.md — Pinaro Campus

## Qué es

Plataforma educativa marca blanca y multi-tenant. **Pinaro** (empresa de tecnología para PyMEs, pinaro.ar) la opera y la vende a **cámaras empresarias**. Cada cámara (tenant) ofrece cursos a sus socios y a las empresas de su padrón. Una sola app, una sola base y un solo deploy sirven a todas las cámaras.

La especificación completa está en `docs/`. Leela antes de tocar un área que no conocés.

## Stack

- **Next.js** (App Router, versión estable actual) + **TypeScript** estricto
- **Tailwind CSS v4** + **shadcn/ui** (Radix), íconos **lucide-react**
- **PostgreSQL** en **Neon** (vía Vercel Marketplace) + **Drizzle ORM** + `drizzle-kit`
- **Auth.js v5** (next-auth) con magic link por email (**Resend**) y sesiones en base de datos (Drizzle adapter)
- **Zod** para validar todo input (server actions, route handlers, archivos de contenido)
- **MDX** para lecciones (`next-mdx-remote/rsc` o equivalente vigente), con una lista cerrada de componentes
- **@react-pdf/renderer** para certificados y **qrcode** para los QR
- **Vercel Blob** para archivos subidos (logos, firmas, PDFs de certificados, recursos)
- **Vitest** (unit) + **Playwright** (e2e)
- **pnpm** como package manager
- Deploy en **Vercel**; repo en GitHub

## Comandos

```bash
pnpm dev                 # dev server (usar http://civa.localhost:3000, ver docs/02)
pnpm build
pnpm lint
pnpm typecheck
pnpm test                # vitest
pnpm test:e2e            # playwright
pnpm db:generate         # drizzle-kit generate (crear migración)
pnpm db:migrate          # aplicar migraciones
pnpm db:studio
pnpm db:seed             # datos demo (idempotente)
pnpm db:reset            # drop + migrate + seed (solo dev)
pnpm courses:validate    # valida content/courses/** contra el schema
pnpm courses:sync        # sincroniza la estructura de los cursos a la base
```

## Reglas no negociables

1. **Aislamiento de tenants.** Toda tabla con `tenant_id` se consulta **solo** a través de `src/lib/db/tenant-scope.ts`. El tenant sale del hostname (resuelto en middleware) y **nunca** de un parámetro que mande el cliente. Hay tests de aislamiento en `tests/isolation/`.
2. **Permisos en el servidor.** Cada server action y route handler llama a `requireRole()` / `requireSuperadmin()` de `src/lib/auth/permissions.ts`. Ocultar un botón en la UI no es control de acceso.
3. **Plata en centavos enteros** (`bigint`/`integer`, `*_cents`), moneda `ARS`. Nunca `float` para montos.
4. **Pagos idempotentes.** Un webhook repetido no puede duplicar inscripciones ni códigos. El estado de una orden solo cambia a partir del estado del pago consultado al proveedor, no del payload del webhook.
5. **Secretos encriptados.** Los tokens de Mercado Pago de cada cámara se guardan con AES-256-GCM (`src/lib/crypto.ts`, clave `ENCRYPTION_KEY`).
6. **El contenido de los cursos vive en archivos** (`content/courses/<slug>/`), versionado en git. La base guarda estructura, progreso y resultados. Los `id` de módulos, lecciones, evaluaciones y preguntas son **estables**: nunca se renombran ni se reutilizan, porque el progreso de los alumnos apunta a ellos.
7. **Las respuestas correctas nunca viajan al cliente** antes de que el alumno envíe una evaluación.
8. **Snapshot en certificados.** Un certificado guarda nombre, curso, horas y fecha al momento de emitirse; si después cambia el curso, el certificado no cambia.
9. **Nada hardcodeado por cámara.** Si te encontrás escribiendo `if (tenant.slug === '...')`, eso va en la configuración del tenant.

## Convenciones

- Código, tablas, columnas y commits en **inglés**. Textos de la UI en **español rioplatense con voseo**.
- Tablas y columnas en `snake_case`; TypeScript en `camelCase`.
- Server Components por defecto; `"use client"` solo donde hace falta interactividad.
- Mutaciones con **server actions** que validan con Zod y devuelven `{ ok: true, data } | { ok: false, error }`.
- Fechas en UTC en la base; se muestran en `America/Argentina/Buenos_Aires`.
- Montos formateados con `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`.
- Un componente por archivo; componentes de dominio en `src/components/<dominio>/`.
- Nada de `any`. Nada de `// @ts-ignore` sin comentario que explique por qué.
- Las decisiones que no están en la especificación van a `docs/DECISIONES.md` (fecha, decisión, motivo).

## Mapa rápido

```
src/middleware.ts                 resuelve host → tenant y reescribe a /[domain]/...
src/app/[domain]/                 sitio de cada cámara (catálogo, alumno, admin de cámara)
src/app/superadmin/               panel de Pinaro (solo en SUPERADMIN_HOSTS)
src/app/api/                      webhooks, OAuth de MP, PDFs, exports, crons
src/lib/tenant/                   resolución de tenant, theme, contexto
src/lib/db/                       cliente, schema/, tenant-scope.ts
src/lib/auth/                     Auth.js config, permissions.ts
src/lib/payments/                 PaymentProvider + providers/{mock,manual,mercadopago}
src/lib/courses/                  schema Zod del contenido, loader, sync, MDX components
src/lib/assessments/              sorteo de preguntas, corrección
src/lib/certificates/             emisión, PDF, códigos
src/lib/pricing.ts                precio socio / no socio
src/lib/cuit.ts                   validación de CUIT
content/courses/                  cursos (fuente de verdad del contenido)
scripts/                          seed, sync y validación de cursos
tests/                            unit, isolation, e2e
```

## Qué NO hacer

- No agregar un "admin de empresa" (no está en el alcance de v1; ver `docs/01-producto.md`).
- No emitir facturas: la plataforma cobra y registra el pago; la facturación va por fuera.
- No hostear video propio: YouTube no listado o Vimeo.
- No crear un proyecto o una base por cámara.
- No usar datos reales de cámaras o empresas en seeds, tests ni textos.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
