# Pinaro Campus

Plataforma educativa **marca blanca y multi-cámara** de Pinaro. Una sola aplicación y una sola base de datos atienden a muchas cámaras empresarias. Cada cámara tiene su dominio, sus colores, su padrón de socios, sus precios y su forma de cobro. Las cámaras ofrecen los cursos a sus socios.

> "Pinaro Campus" es un nombre de trabajo. Cada cámara ve la plataforma con su propia marca (por ejemplo, "Campus Cámara X").

La especificación completa está en `docs/` (ver tabla abajo) y el contexto permanente del repo en [`CLAUDE.md`](CLAUDE.md). Se implementa fase por fase según [`docs/07-fases.md`](docs/07-fases.md).

## Desarrollo

Requisitos: Node 24+, [pnpm](https://pnpm.io) 12.6.0 (`corepack enable && corepack prepare pnpm@12.6.0 --activate`, o `npm install -g pnpm@12.6.0`), y una base Postgres de Neon.

```bash
pnpm install
cp .env.example .env.local   # completar DATABASE_URL / DATABASE_URL_UNPOOLED de Neon como mínimo

pnpm dev                     # usar http://civa.localhost:3000 o http://ribera.localhost:3000 (una cámara por host)
pnpm build
pnpm lint
pnpm typecheck
pnpm test                    # vitest
pnpm test:e2e                # playwright

pnpm db:seed                 # datos de demo (idempotente)
pnpm courses:validate        # valida content/courses/** contra el schema
pnpm courses:sync            # sincroniza los cursos a la base (también corre en el build de Vercel)

pnpm db:generate             # crea una migración a partir de src/lib/db/schema
pnpm db:migrate              # aplica migraciones contra DATABASE_URL_UNPOOLED
pnpm db:studio
```

## Qué hay en el repo

| Archivo | Para qué sirve |
|---|---|
| `CLAUDE.md` | Contexto permanente del repo (stack, reglas no negociables, convenciones). |
| `docs/01-producto.md` | Visión, roles, flujos de usuario y reglas de negocio. |
| `docs/02-arquitectura.md` | Stack, multi-tenancy por dominio, auth, estructura de carpetas, variables de entorno. |
| `docs/03-modelo-de-datos.md` | Todas las tablas, campos, relaciones e índices. |
| `docs/04-pagos.md` | Interfaz `PaymentProvider`, Mercado Pago marketplace, pago manual, mock, webhooks, liquidaciones. |
| `docs/05-formato-de-cursos.md` | Cómo se escribe un curso: `course.json`, lecciones MDX, evaluaciones, componentes interactivos. |
| `docs/06-certificados.md` | Emisión, PDF, QR y verificación pública. |
| `docs/07-fases.md` | Plan de implementación en 8 fases con criterios de aceptación. |
| `docs/08-diseno-ui.md` | Sistema visual base, theming por cámara, pantallas y textos. |
| `docs/09-demo-y-seed.md` | Datos ficticios para que la demo se vea viva y el login de demo en un clic. |
| `docs/10-pipeline-de-cursos.md` | Proceso para pasar del material de una cámara a un curso publicado en un día. |
| `docs/DECISIONES.md` | Decisiones tomadas durante la implementación que no estaban en la especificación. |
| `.claude/commands/nuevo-curso.md` | Comando de Claude Code (`/nuevo-curso`) que convierte material crudo en un curso. |
| `content/courses/eficiencia-energetica-pymes-industriales/` | Curso demo completo, listo para cargar (Fase 2). |

## Dominio de la demo

La demo corre en **`plataforma.pinaro.ar`**, que muestra la cámara ficticia principal. Desde el panel de superadmin se puede "ver como" la segunda cámara ficticia, para mostrar en vivo el cambio de marca.
