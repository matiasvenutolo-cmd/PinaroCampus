# 07 — Plan por fases

Cada fase termina con: lint + typecheck + tests en verde, criterios de aceptación verificados a mano, commit y resumen para revisión. **No arrancar la fase siguiente sin OK.**

El seed (`docs/09-demo-y-seed.md`) crece en cada fase: siempre tiene que haber datos para probar lo que se construyó.

---

## Fase 0 — Cimientos

**Alcance**
- Next.js + TypeScript estricto + Tailwind v4 + shadcn/ui + ESLint + Prettier.
- `src/env.ts` con validación Zod de variables; `.env.example`.
- Drizzle + Neon: conexión, `drizzle.config.ts`, scripts `db:*`.
- Vitest y Playwright configurados con un test trivial cada uno.
- GitHub Actions: install → lint → typecheck → test → `courses:validate` (este último se agrega en la Fase 2).
- Fuente Geist, tokens base de `08-diseno-ui.md`, layout mínimo.
- `docs/DECISIONES.md` creado.

**Aceptación**
- `pnpm dev` levanta; `pnpm build` pasa; CI verde en un PR.
- `pnpm db:migrate` contra una base Neon de desarrollo funciona.

---

## Fase 1 — Multi-tenant, marca y autenticación

**Alcance**
- Tablas: `tenants`, `tenant_domains`, `users` + Auth.js, `tenant_memberships`, `companies`, `categories`, `audit_log`, `rate_limits`.
- Middleware + resolver + `tenant-scope.ts` + tests de aislamiento.
- Theme por tenant: CSS variables inyectadas en `[domain]/layout.tsx`, cálculo automático de color de texto sobre el primario (contraste WCAG), logo, favicon y `campus_name` en el `<title>`.
- Auth.js con magic link (Resend), email con la marca de la cámara, rate limit.
- Onboarding `/bienvenida`: nombre, apellido, DNI opcional, CUIT con validación de dígito verificador (`src/lib/cuit.ts`), cargo, términos. Resolución de `member_status` según el modo de validación.
- `/demo` con login en un clic (solo tenants demo).
- `permissions.ts`.
- Superadmin mínimo: lista de cámaras, crear/editar cámara (datos, marca con preview en vivo, dominios), nombrar admins por email, "Ver como".
- Páginas legales con plantilla por defecto.
- Seed: 2 cámaras demo con dominios locales y de producción, superadmin, admins, 25 alumnos, padrón de empresas.

**Aceptación**
- `civa.localhost:3000` y `ribera.localhost:3000` muestran marcas distintas (logo, colores, nombre) con el mismo código.
- Login por magic link en una cámara no da sesión en la otra.
- Un alumno de CIVA con CUIT de una empresa socia queda `verified` (modo `cuit`); con CUIT fuera del padrón queda `none` y se crea la empresa como `self_declared`.
- Un alumno no puede entrar a `/admin`; un admin de CIVA no puede ver datos de Ribera (test automatizado).
- Superadmin cambia el color primario de una cámara y se ve reflejado sin redeploy.

---

## Fase 2 — Motor de cursos y reproductor

**Alcance**
- `src/lib/courses/schema.ts` (Zod), `loader.ts`, `pnpm courses:validate`, `pnpm courses:sync`.
- Tablas: `courses`, `course_modules`, `lessons`, `assessments`, `tenant_courses`, `enrollments`, `lesson_progress`, `waitlist_entries`.
- Render MDX con la lista cerrada de componentes y **todas las calculadoras** de `05-formato-de-cursos.md`.
- Home de la cámara, catálogo con filtros por categoría y búsqueda, detalle del curso (temario, docentes, qué vas a aprender, a quién está dirigido, precios socio/no socio según quién mira, "Próximamente" + lista de espera).
- "Mi campus": cursos en curso y completados, progreso, "Continuar".
- Reproductor: temario lateral (drawer en mobile), lección, anterior/siguiente, "Marcar como completada", progreso, videos embebidos o guion, recursos descargables, checklist persistida.
- Inscripción gratuita (precio 0) y por admin, para poder probar sin pagos.
- Superadmin: biblioteca de cursos (estado de sync, hash), asignar curso a cámara con precios y categoría. Link de vista previa firmado (`/preview/<slug>/<lessonKey>?token=`) con vencimiento de 14 días.
- Seed: curso demo sincronizado y asignado a ambas cámaras + 5 cursos `coming_soon` (ver 09).

**Aceptación**
- El curso de eficiencia energética se ve completo y prolijo en desktop y en mobile (390 px), con las 6 calculadoras funcionando y los valores por defecto del caso práctico.
- Cambiar un texto en un `.mdx`, correr sync y ver el cambio; el progreso de los alumnos se mantiene.
- `courses:validate` falla si se agrega `<Foo />` a un MDX o se rompe una referencia.
- Un alumno con 50% del curso ve 50% y "Continuar" lo lleva a la lección correcta.

---

## Fase 3 — Evaluaciones y certificados

**Alcance**
- Tabla `assessment_attempts`, `certificates`.
- Quiz de práctica y examen final según `05` (sorteo, mezcla, temporizador, intentos, espera entre intentos, corrección en el servidor, explicaciones según configuración).
- Emisión automática, PDF, QR, `/verificar/[code]`, "Mis certificados", compartir en LinkedIn, gestión en el panel de la cámara (lista, revocar, reemitir).
- Emails: certificado emitido.
- Seed: 3 alumnos con certificado, 1 con examen desaprobado y un intento restante.

**Aceptación**
- Aprobar el examen con todas las lecciones completas emite el certificado una sola vez, aunque se recargue la página.
- Las respuestas correctas no aparecen en el HTML ni en el payload de red antes de enviar (verificado con un test e2e que inspecciona la respuesta).
- El QR del PDF abre la verificación y muestra "Válido". Revocar → "Revocado" y el PDF devuelve 410.
- El PDF se ve bien con 1, 2 y 3 firmantes y con nombres largos (40+ caracteres).

---

## Fase 4 — Comercial: precios, órdenes, vacantes (con mock y manual)

**Alcance**
- Tablas: `orders`, `order_items`, `payments`, `payment_events`, `seat_codes`.
- `pricing.ts`, `PaymentProvider`, `service.ts`, proveedores `mock` y `manual`.
- Flujo de compra individual y de vacantes (`/empresas/comprar`), checkout, resultado, "Mis compras" con códigos (copiar, CSV, enviar por email, estado), `/canjear`.
- Panel de la cámara: órdenes y pagos, transferencias pendientes (marcar pagada, cancelar), vacantes (crear códigos sin orden), inscripción manual, empresas/padrón con importación CSV (preview, validación de CUIT, upsert, reporte de errores), socios pendientes de aprobación.
- Cron `expire-orders`.
- Emails: orden pendiente de transferencia, pago aprobado/rechazado, códigos listos, te regalaron una vacante, socio aprobado/rechazado.
- Tests de `04-pagos.md` (los que no son de MP).

**Aceptación**
- En la demo: un alumno no socio ve el precio no socio; uno socio ve el precio socio; ambos compran con el pago simulado y quedan inscriptos.
- Una compra de 10 vacantes aprobada genera 10 códigos; enviar 3 por email; canjear 1 desde otra cuenta; el comprador ve el estado actualizado.
- Una transferencia queda pendiente, el admin la marca pagada y el alumno queda inscripto y recibe el email; queda en `audit_log`.
- Aprobar dos veces el mismo pago simulado no duplica nada.

---

## Fase 5 — Mercado Pago

**Alcance**
- Consultar la documentación oficial vigente y reportar diferencias con `04-pagos.md` **antes** de codear.
- Proveedor `mercadopago` para `tenant_account` (OAuth + `marketplace_fee`) y `platform_account`.
- `/admin/configuracion/cobros`: conectar/desconectar, estado de la cuenta, habilitar medios de pago.
- Webhook con validación de firma, consulta del pago y chequeos de tenant y monto.
- Cron `refresh-mp-tokens`.
- Liquidaciones para `platform_account` (superadmin y vista de la cámara).
- Tests de webhook con fixtures.

**Aceptación** (en sandbox de MP, con cuentas de prueba)
- La cámara Ribera conecta su cuenta de prueba de vendedor; una compra con tarjeta de prueba aprueba, inscribe y la comisión configurada aparece retenida.
- CIVA configurada en `platform_account`: la compra cae en la cuenta de prueba de Pinaro y aparece en la liquidación del período.
- Un webhook con firma alterada se rechaza.

---

## Fase 6 — Panel de la cámara y reportes

**Alcance**
- Dashboard con KPIs y gráficos simples (inscripciones por semana, ingresos por mes, top cursos, top empresas).
- Reportes por curso, por empresa y por alumno, con filtros de fecha y export CSV.
- Gestión de cursos de la cámara (precio, categoría, visibilidad, destacado, orden, abrir/cerrar inscripción, días de acceso), categorías (CRUD + orden), lista de espera (ver, exportar, "notificar que el curso está disponible").
- Configuración completa: marca con preview y chequeo de contraste, textos del home, firmas del certificado (subida de imagen con fondo transparente), modo de validación de socios, datos de transferencia, textos legales.
- Superadmin: métricas globales, página de salud.

**Aceptación**
- Un admin puede cambiar toda la configuración de su cámara sin ayuda de Pinaro y ver el resultado al instante.
- El reporte por empresa muestra cuántos empleados de cada empresa se inscribieron y certificaron, y exporta el mismo dato a CSV.

---

## Fase 7 — Pulido, demo y deploy

**Alcance**
- Revisión completa de mobile, estados vacíos, estados de carga (skeletons), errores (404/500 con marca), accesibilidad (axe en Playwright).
- SEO básico por cámara (metadata, Open Graph con el logo y el color, sitemap del catálogo), `noindex` en tenants demo.
- Seed final de demo (`09`) con fechas relativas a "hoy", para que la demo siempre se vea reciente.
- E2E de punta a punta: login demo → comprar → cursar → rendir → certificado → verificar; compra de vacantes → canje.
- Deploy en Vercel: proyecto, Neon de producción, variables, dominio `plataforma.pinaro.ar`, crons, `courses:sync` en el build.
- `docs/OPERACION.md`: cómo dar de alta una cámara, cómo agregar un dominio, cómo publicar un curso, cómo resetear la demo.
- Script `pnpm demo:reset` para dejar la demo como nueva antes de una reunión (solo tenants `is_demo`).

**Aceptación**
- En `plataforma.pinaro.ar`, alguien que nunca vio la plataforma puede, en menos de 5 minutos y sin ayuda: entrar como alumno demo, comprar el curso con pago simulado, completar una lección con calculadora y ver su progreso. Y como admin demo: ver el dashboard con datos y cambiar el color de la cámara.
- Lighthouse mobile ≥ 90 en performance y accesibilidad en home, catálogo y detalle de curso.
