# 02 — Arquitectura

## Principio

**Una app, una base, un deploy, N cámaras.** El tenant se resuelve por el **hostname** de cada request.

## Dominios

| Host | Qué muestra |
|---|---|
| `plataforma.pinaro.ar` | **Demo.** Cámara ficticia principal (`civa`) + panel `/superadmin`. |
| `<slug>.pinaro.ar` | Opción para cámaras que no quieren tocar su DNS (requiere wildcard `*.pinaro.ar` en Vercel). |
| `plataforma.<dominio-de-la-camara>` | Producción recomendada: la cámara crea un CNAME a `cname.vercel-dns.com` y Pinaro agrega el dominio al proyecto de Vercel. |
| `civa.localhost:3000`, `ribera.localhost:3000` | Desarrollo local (Chrome y Firefox resuelven `*.localhost` a 127.0.0.1). |

La tabla `tenant_domains` mapea hostname → tenant. Un tenant puede tener varios dominios; uno es `is_primary` y se usa para armar los links en emails y certificados.

**Alta de dominio custom (manual en v1, documentada en el panel de superadmin):**
1. Superadmin agrega el hostname en `tenant_domains`.
2. Pinaro lo agrega al proyecto en Vercel (Dashboard → Domains). En v2 se automatiza con la API de dominios de Vercel.
3. La cámara crea el CNAME. Vercel emite el certificado SSL solo.
4. Superadmin marca `verified_at`.

## Resolución de tenant

### Middleware (`src/middleware.ts`)

1. Leer `host` (sin puerto en producción; con puerto en dev).
2. Excluir: `/_next`, `/api`, archivos estáticos, `/favicon.ico`.
3. Si el host está en `SUPERADMIN_HOSTS` y el path empieza con `/superadmin` → no reescribir (va a `src/app/superadmin`).
4. **Preview de superadmin:** si el host está en `SUPERADMIN_HOSTS` y existe la cookie firmada `pc_preview_tenant` (la setea el superadmin desde "Ver como"), usar ese slug como tenant. En cualquier otro host la cookie se ignora.
5. En desarrollo, si `DEV_TENANT_OVERRIDE` está definida, usarla.
6. Reescribir `/<path>` → `/<host>/<path>` para que lo atienda `src/app/[domain]/...`. Para el preview, reescribir a `/__slug__<slug>/<path>` o equivalente que el resolver entienda.
7. Setear el header `x-pc-host` para los route handlers.

El middleware **no consulta la base**: solo reescribe. La resolución host → tenant ocurre en el servidor.

### Resolver (`src/lib/tenant/resolve.ts`)

```ts
export const getTenantByHost = cache(async (host: string): Promise<Tenant | null> => { ... })
```

- Consulta `tenant_domains` join `tenants`, cacheada por hostname (cache de Next con tag `tenant:<id>`; se invalida con `revalidateTag` cuando el admin cambia la configuración).
- Si no hay tenant o está `suspended` → página 404 genérica de Pinaro ("Esta plataforma no está disponible").
- `getCurrentTenant()` lo lee desde el segmento `[domain]` o desde el header; lo usan Server Components, server actions y route handlers.

### Scoping en la base (`src/lib/db/tenant-scope.ts`)

Toda consulta a tablas con `tenant_id` pasa por funciones que reciben el `tenantId` explícito:

```ts
const scoped = forTenant(tenant.id)
await scoped.enrollments.findMany({ where: { userId } })   // agrega tenant_id automáticamente
await scoped.orders.insert({ ... })                        // agrega tenant_id automáticamente
```

Implementación sugerida: wrappers finos sobre Drizzle con `and(eq(table.tenantId, tenantId), ...)`. Además se agrega un **lint custom o un test** que falle si se importa `db` directo en `src/app/[domain]/**` (solo `tenant-scope` puede usarlo ahí).

Tests en `tests/isolation/`: con dos tenants seed, verificar que ningún helper devuelve filas del otro tenant (órdenes, alumnos, inscripciones, certificados, códigos, empresas).

> Evaluar Row Level Security de Postgres como segunda capa en una versión futura. En v1 alcanza con el scoping en la aplicación más los tests.

## Autenticación

- **Auth.js v5** con provider de email (magic link vía Resend) y `@auth/drizzle-adapter`.
- `trustHost: true`: la URL de callback se arma con el host del request, así el magic link vuelve al dominio de la cámara correcta.
- Las cookies de sesión son **host-only** (sin `domain`): una sesión en la cámara A no vale en la cámara B. Es deliberado.
- Los usuarios son **globales** (tabla `users`, email único). La pertenencia a cada cámara está en `tenant_memberships`. En el primer login en una cámara se crea la membership con rol `student` y se redirige al onboarding.
- El email del magic link lleva la marca de la cámara (se resuelve el tenant por el host del request en `sendVerificationRequest`).
- Rate limit en el pedido de magic link: 5 por email por hora y 20 por IP por hora (tabla simple o Upstash si está disponible; en v1 alcanza con una tabla).
- **Login de demo** (solo si `DEMO_MODE=true` y `tenant.is_demo`): página `/demo` con botones "Entrar como alumno", "Entrar como alumno con curso avanzado", "Entrar como admin de la cámara". Crea la sesión directamente para usuarios seed conocidos. **Nunca** disponible en tenants que no son demo.

### Permisos (`src/lib/auth/permissions.ts`)

```ts
requireUser()                        // sesión válida o redirect a /ingresar
requireMembership(tenant)            // membership en esta cámara o redirect a /bienvenida
requireRole(tenant, 'tenant_admin')  // 403 si no
requireSuperadmin()                  // users.is_superadmin y host ∈ SUPERADMIN_HOSTS
```

## Estructura de carpetas

```
src/
  middleware.ts
  app/
    [domain]/
      layout.tsx                    # carga tenant, inyecta theme (CSS vars), header/footer
      page.tsx                      # home de la cámara
      cursos/page.tsx               # catálogo
      cursos/[slug]/page.tsx        # detalle
      ingresar/ ...                 # login magic link
      bienvenida/page.tsx           # onboarding
      demo/page.tsx                 # login de demo
      mi-campus/page.tsx            # dashboard alumno
      mi-campus/certificados/page.tsx
      mis-compras/page.tsx
      mis-compras/[orderId]/page.tsx
      aprender/[slug]/[lessonKey]/page.tsx
      aprender/[slug]/evaluacion/[assessmentKey]/page.tsx
      checkout/[orderId]/page.tsx
      checkout/[orderId]/resultado/page.tsx
      checkout/simulado/[paymentId]/page.tsx   # proveedor mock
      empresas/comprar/page.tsx     # compra de vacantes
      canjear/page.tsx
      verificar/[code]/page.tsx     # público
      legal/privacidad/page.tsx
      legal/terminos/page.tsx
      admin/ ...                    # panel de la cámara (ver 08-diseno-ui.md)
    superadmin/ ...
    preview/[slug]/[lessonKey]/page.tsx   # vista previa firmada de cursos (docentes)
    api/
      auth/[...nextauth]/route.ts
      webhooks/mercadopago/route.ts
      mp/oauth/start/route.ts
      mp/oauth/callback/route.ts
      certificates/[code]/pdf/route.ts
      admin/export/[report]/route.ts
      cron/expire-orders/route.ts
      cron/refresh-mp-tokens/route.ts
  components/
    ui/                             # shadcn
    brand/                          # logo de cámara, "Powered by Pinaro"
    catalog/ course/ player/ assessment/ checkout/ admin/ superadmin/
    mdx/                            # componentes permitidos en lecciones
    calculators/                    # calculadoras interactivas
  lib/
    tenant/{resolve.ts, theme.ts, context.ts}
    db/{index.ts, tenant-scope.ts, schema/*.ts}
    auth/{config.ts, permissions.ts, demo.ts}
    payments/{types.ts, registry.ts, service.ts, providers/{mock.ts, manual.ts, mercadopago.ts}}
    courses/{schema.ts, loader.ts, sync.ts, mdx.tsx, progress.ts}
    assessments/{draw.ts, grade.ts}
    certificates/{issue.ts, pdf.tsx, code.ts}
    email/{send.ts, templates/*.tsx}
    pricing.ts  cuit.ts  crypto.ts  codes.ts  audit.ts  format.ts
content/courses/<slug>/...
scripts/{seed.ts, courses-validate.ts, courses-sync.ts}
tests/{unit, isolation, e2e}
```

## Contenido de cursos: archivo → base

- **Fuente de verdad:** `content/courses/<slug>/` (ver `05-formato-de-cursos.md`).
- `pnpm courses:validate`: valida con Zod, verifica que existan los archivos referenciados, que los `id` sean únicos, que las respuestas correctas existan entre las opciones, que el `drawCount` del examen no supere el banco de preguntas y que los componentes MDX usados estén en la lista permitida. Corre en CI.
- `pnpm courses:sync`: hace upsert de `courses`, `course_modules`, `lessons` y `assessments` por `slug`/`key`. Calcula `content_hash`. **Nunca borra** lecciones con progreso: las marca `archived`. Corre en el build de Vercel (`postbuild` o paso previo) y a mano.
- El **cuerpo** de las lecciones (MDX) se lee del filesystem en el render y se compila en el servidor con la lista cerrada de componentes. Las páginas de lección se cachean por `content_hash`.
- En una versión futura se podrá editar contenido desde el panel; por eso la base ya guarda la estructura con `key` estables.

## Caching

- Tenant por host: cache con tag `tenant:<id>`.
- Catálogo por tenant: tag `catalog:<tenantId>`; se invalida al cambiar precios, visibilidad o categorías.
- Lecciones: tag `course:<courseId>:<hash>`.
- Nada que dependa del usuario (progreso, precio socio) se cachea compartido.

## Variables de entorno

```bash
DATABASE_URL=                      # Neon (pooled)
DATABASE_URL_UNPOOLED=             # migraciones
AUTH_SECRET=
AUTH_TRUST_HOST=true
RESEND_API_KEY=
EMAIL_FROM="Campus <campus@pinaro.ar>"
BLOB_READ_WRITE_TOKEN=
ENCRYPTION_KEY=                    # 32 bytes base64 (AES-256-GCM)
PREVIEW_SIGNING_SECRET=            # cookies de "ver como" y links de preview de cursos
SUPERADMIN_HOSTS=plataforma.pinaro.ar,localhost:3000,civa.localhost:3000
PLATFORM_ROOT_DOMAIN=pinaro.ar
DEMO_MODE=true
DEV_TENANT_OVERRIDE=               # opcional, solo dev
SEED_SUPERADMIN_EMAIL=             # email de Matías para el seed
CRON_SECRET=
# Mercado Pago (aplicación de Pinaro)
MP_CLIENT_ID=
MP_CLIENT_SECRET=
MP_PLATFORM_ACCESS_TOKEN=          # cuenta de Pinaro, para platform_account
MP_WEBHOOK_SECRET=
MP_SANDBOX=true
```

Crear `src/env.ts` que valide todas con Zod al arrancar y exporte un objeto tipado. Mantener `.env.example` actualizado.

## Crons (vercel.json)

- `expire-orders`: cada hora; órdenes `pending`/`awaiting_payment` sin pago en 72 h → `expired` (las de transferencia: 7 días, configurable por tenant).
- `refresh-mp-tokens`: diario; refresca tokens de MP que vencen en menos de 30 días.

Ambos exigen `Authorization: Bearer ${CRON_SECRET}`.

## Observabilidad

- Logs estructurados (`console` con JSON) en webhooks y pagos, con `tenantId`, `orderId` y `paymentId`.
- `payment_events` guarda todo webhook recibido, válido o no.
- Página `/superadmin/salud`: último sync de cursos, webhooks fallidos de las últimas 24 h, tokens de MP por vencer.
