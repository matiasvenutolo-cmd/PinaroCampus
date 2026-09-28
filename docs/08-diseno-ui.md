# 08 — Diseño y UI

## Principios

- **La marca es de la cámara.** La plataforma es un lienzo neutro y prolijo; la identidad la ponen el logo y el color primario de cada cámara. Pinaro aparece solo en el pie ("Plataforma provista por Pinaro" con el isotipo chico).
- **Claro, sobrio, legible.** Fondo claro siempre, mucho aire, tipografía grande en las lecciones. Es una herramienta de trabajo para gente de industria, no una red social.
- **Mobile first.** El reproductor de lecciones tiene que funcionar perfecto en 390 px.
- **Español rioplatense con voseo** en todos los textos: "Empezá", "Inscribite", "Tu progreso", "Te falta 1 lección".

## Base neutra (no cambia entre cámaras)

```css
:root {
  --font-sans: 'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;

  --background: #FAFAFA;
  --surface: #FFFFFF;
  --surface-muted: #F4F6F8;
  --text: #171717;
  --text-muted: #6B7280;
  --text-soft: #9CA3AF;
  --border: #E8E8E8;
  --border-strong: #D1D5DB;

  --success: #16A34A;
  --warning: #D97706;
  --danger: #DC2626;

  --radius: 12px;
  --radius-sm: 8px;
  --maxw: 1200px;
}
```

## Theme por cámara

`tenants.theme` (jsonb):

```json
{ "primary": "#1E4FA3", "primaryForeground": "auto", "accent": "#F2A900", "accentForeground": "auto", "radius": 12 }
```

- `src/lib/tenant/theme.ts` convierte el theme en variables CSS (`--primary`, `--primary-foreground`, `--primary-soft` = primario al 8%, `--primary-hover`, `--accent`, `--accent-foreground`) y las inyecta en un `<style>` del layout del tenant. Tailwind v4 las consume con `@theme inline`.
- `"auto"` → se elige blanco o `#0A0A0A` según contraste WCAG. En el panel de marca, si el primario elegido tiene contraste < 4,5:1 contra el fondo (para links y texto), se muestra una advertencia y se sugiere una variante más oscura.
- **Dónde va el primario:** botones principales, links, barra de progreso, ítem activo del temario, franja superior de las tarjetas de curso, íconos de categorías, fondo del hero (en versión suave o con un degradé sutil del primario a su versión oscura).
- **Dónde va el acento:** etiquetas ("Nuevo", "Destacado", "Precio socio"), detalles de las calculadoras y los `KeyFigure`.
- Portada generada para cursos sin `cover`: fondo primario con un patrón geométrico sutil, el ícono de la categoría y el título en blanco. Se genera como SVG en el servidor.

## Pantallas del sitio de la cámara

### Header
Logo de la cámara (link al home) · Cursos · Para empresas · (logueado) Mi campus / avatar con menú: Mis compras, Mis certificados, Mis datos, Panel de la cámara (si es admin), Salir · (no logueado) Ingresar.

### Home
1. **Hero:** `heroTitle` ("Capacitación para las empresas de la Cámara"), `heroSubtitle`, CTA "Ver cursos" y secundario "Capacitá a tu equipo".
2. **Categorías:** grilla de tarjetas con ícono y cantidad de cursos.
3. **Cursos destacados:** tarjetas.
4. **Cómo funciona:** 3 pasos (Elegí un curso → Cursá a tu ritmo, desde cualquier dispositivo → Obtené tu certificado verificable).
5. **Para empresas:** "Comprá vacantes para tu equipo y seguí su avance" + CTA.
6. **Beneficio socio:** "Si tu empresa es socia de la cámara, accedés a precios preferenciales" (se oculta en modo `open`).
7. Footer: datos de contacto de la cámara, link al sitio institucional, legales, "Plataforma provista por Pinaro".

### Tarjeta de curso
Portada (16:9) · categoría · título · duración y nivel · precio (si el usuario es socio verificado: solo precio socio con la etiqueta "Precio socio"; si no: precio no socio y abajo, chico, "Socios: $X") · etiqueta "Próximamente" / "Inscripto" / "Completado" cuando corresponde.

### Detalle del curso
Columna principal: título, subtítulo, descripción, "Qué vas a aprender", temario plegable por módulo (con duración y tipo de cada lección), "A quién está dirigido", requisitos, docentes, certificado (con una imagen de ejemplo del certificado de la cámara).
Columna lateral fija (en mobile, barra inferior fija): precio, CTA "Inscribirme" / "Continuar el curso", "Comprar para mi equipo", duración, cantidad de lecciones, certificado incluido.

### Reproductor
- Desktop: temario a la izquierda (280 px, módulos plegables, check en lecciones completas, ítem actual resaltado con el primario), contenido centrado con ancho de lectura (~720 px), barra superior con título del curso, barra de progreso y "Salir".
- Mobile: temario en un drawer; navegación anterior/siguiente fija abajo.
- Lección de texto: tipografía de 18 px, interlineado 1,7, títulos `##` con buen aire, tablas con scroll horizontal.
- Al completar la última lección obligatoria, si falta el examen: tarjeta "Ya podés rendir el examen final".
- Al aprobar: pantalla de felicitación con confeti sutil (una sola vez), descarga del certificado y botón para compartir.

### Evaluación
Pantalla previa (cantidad de preguntas, tiempo, nota mínima, intentos restantes) → una pregunta por pantalla en mobile, todas en una columna en desktop → confirmación → resultado (nota, aprobado/no, revisión con explicaciones según la configuración).

### Mi campus
Saludo con el nombre · "Seguí donde dejaste" (último curso) · Mis cursos (en curso / completados) · Mis certificados · accesos a Mis compras.

### Mis compras
Lista de órdenes (número, fecha, curso, tipo, total, estado). Detalle de un paquete de vacantes: resumen (N compradas, M enviadas, K canjeadas), tabla de códigos con estado y alumno, acciones "Copiar", "Descargar CSV", "Enviar por email" (modal con textarea para pegar emails, validación y vista previa del mail).

## Panel de la cámara (`/admin`)

Layout con sidebar (colapsable en mobile):
- **Inicio** (dashboard)
- **Cursos** (los asignados a la cámara) · **Categorías**
- **Alumnos** · **Empresas** (padrón) · **Socios pendientes** (badge con la cantidad)
- **Órdenes** · **Vacantes** · **Certificados**
- **Lista de espera**
- **Reportes**
- **Configuración**: Marca · Home · Cobros · Certificado · Socios · Legales · Administradores

Tablas con búsqueda, filtros, paginación del lado del servidor y export CSV. Formularios con validación en línea. Toda acción destructiva pide confirmación y deja registro.

## Panel de superadmin (`/superadmin`)

Estética Pinaro (fondo claro, Geist, detalles con el gradiente de marca `linear-gradient(135deg, #22D3EE 0%, #8B5CF6 50%, #F472B6 100%)` solo en el encabezado). Secciones: Cámaras · Biblioteca de cursos · Liquidaciones · Métricas · Salud. En la ficha de cada cámara: "Ver como", link al sitio, KPIs, configuración, dominios, admins, cursos asignados.

## Componentes y detalles

- shadcn/ui: Button, Card, Dialog, Sheet (drawer), Tabs, Table, Badge, Progress, Accordion, Toast (sonner), Form, Select, Command (búsqueda), Skeleton.
- Íconos lucide, trazo 1,75.
- Estados vacíos con ilustración simple (ícono grande en `--primary-soft`) + texto útil + acción ("Todavía no te inscribiste en ningún curso. Mirá el catálogo").
- Skeletons en catálogo, mi campus y tablas.
- Toasts para acciones exitosas ("Código copiado", "Guardado").
- Formato argentino en todo: `$ 45.000`, `14/10/2026`, `1.234 kWh`.

## Emails

React Email. Plantilla base: logo de la cámara arriba, contenido en una tarjeta blanca, botón con el color primario, pie con datos de la cámara y "Plataforma provista por Pinaro". Asunto y remitente con el nombre de la cámara: `"Campus CIVA" <campus@pinaro.ar>`, `reply-to` = `contact_email`.
