Vamos a construir **Pinaro Campus**: una plataforma educativa marca blanca y multi-tenant que Pinaro vende a cámaras empresarias para que ofrezcan cursos a sus socios. Tiene que quedar **funcional de punta a punta** (no un mockup) y desplegada en `plataforma.pinaro.ar`, porque la vamos a usar para mostrársela a cámaras.

## Antes de escribir código

1. Leé `CLAUDE.md` y después todos los archivos de `docs/` en orden (01 a 10). Son la especificación. Si algo del código que escribas contradice la especificación, gana la especificación, salvo que me lo consultes antes.
2. Revisá el curso en `content/courses/eficiencia-energetica-pymes-industriales/`. Ya está escrito y es el curso demo: la plataforma tiene que renderizarlo tal cual. No reescribas su contenido. Si el formato no te cierra, proponé el cambio en la especificación y en el curso a la vez.
3. Devolveme:
   - Un resumen de 10 a 15 líneas de lo que entendiste (producto, multi-tenancy, pagos, cursos).
   - Las dudas o contradicciones que encuentres en la especificación, numeradas.
   - El plan concreto de la **Fase 0** (archivos que vas a crear, dependencias con versión, comandos).
4. Esperá mi OK antes de arrancar.

## Cómo quiero que trabajes

- **Una fase por vez**, según `docs/07-fases.md`. Al terminar cada fase:
  - Corré `pnpm lint`, `pnpm typecheck` y `pnpm test`, y dejá todo en verde.
  - Verificá a mano los criterios de aceptación de la fase. Levantá el dev server y recorré los flujos; si podés, usá Playwright.
  - Hacé commit con un mensaje claro (`feat(fase-2): motor de cursos y reproductor`).
  - Mandame un resumen: qué hiciste, cómo lo pruebo (URLs y usuarios), qué quedó pendiente y qué decisiones tomaste. Después **frená** hasta mi OK.
- **Aislamiento entre cámaras:** nunca escribas una consulta a la base sin filtrar por `tenant_id` en tablas que lo tienen. Usá los helpers de `src/lib/db/tenant-scope.ts` (ver `docs/02-arquitectura.md`). Tiene que haber tests que prueben que una cámara no puede ver datos de otra.
- **Mercado Pago:** no inventes endpoints, campos ni nombres de parámetros. Antes de implementar la Fase 5, consultá la documentación oficial vigente de Mercado Pago (Checkout Pro, OAuth para marketplace, `marketplace_fee`, validación de firma de webhooks). Si algo de `docs/04-pagos.md` no coincide con la documentación actual, avisame y ajustamos.
- **Librerías:** usá versiones estables actuales. Si una librería de la especificación está deprecada o cambió de API, proponé la alternativa antes de usarla.
- **Textos de la interfaz:** en español rioplatense con voseo ("Inscribite", "Empezá el curso"). Código, nombres de tablas y commits, en inglés.
- **Nada de datos reales de cámaras ni de empresas.** Todo lo de la demo es ficticio y está definido en `docs/09-demo-y-seed.md`.
- Si una decisión no está en la especificación y es fácil de revertir, tomala, anotala en `docs/DECISIONES.md` y seguí. Si es difícil de revertir (modelo de datos, auth, pagos), preguntame.

## Contexto de negocio en una línea

Cada cámara nueva tiene que costar configuración, no desarrollo: un registro en la base, un dominio y una paleta de colores. Cada curso nuevo tiene que llevar un día, no una semana. Cualquier decisión que ponga en riesgo esas dos cosas está mal.

Arrancá leyendo.
