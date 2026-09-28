# 10 — Pipeline de cursos: del material de la cámara a un curso publicado en un día

El cuello de botella de este negocio no es la plataforma, es el contenido. Este proceso convierte material crudo (presentaciones, PDFs, grabaciones de clases, apuntes de un docente) en un curso con el formato de `05-formato-de-cursos.md`, usando Claude Code con el comando `/nuevo-curso`.

## 1. Relevamiento (antes del día de producción)

La cámara completa un formulario (puede ser un Google Form o una página de la plataforma en v2):

| Dato | Ejemplo |
|---|---|
| Título tentativo | "Seguridad e higiene en planta: lo esencial" |
| Objetivo en una frase | "Que un supervisor sepa identificar y corregir los 10 riesgos más comunes de su planta" |
| Público | Supervisores, encargados, responsables de mantenimiento |
| Nivel | Inicial / intermedio / avanzado |
| Duración estimada | 4 a 8 horas |
| Docente(s) | Nombre, cargo, bio de 2 líneas, foto |
| Material | PPT, PDF, videos, grabaciones, links |
| ¿Tiene preguntas de evaluación propias? | Sí / No (si sí, adjuntarlas) |
| Certificado | Horas, firmantes (nombre, cargo, firma escaneada) |
| Precios | Socio / no socio |
| Categoría | De las existentes o una nueva |
| Fecha de lanzamiento deseada | |

**Regla:** si falta el material o el docente no está disponible para revisar el día de producción, el curso no entra en la agenda.

## 2. El día de producción

| Hora | Paso | Quién |
|---|---|---|
| 0:00–1:00 | **Ingesta.** Copiar todo a `inbox/<slug>/`. Convertir a texto: PPT/PDF → markdown (con la skill de Claude o `markitdown`), videos/grabaciones → transcripción (Whisper u otro). Guardar las transcripciones en `inbox/<slug>/transcripciones/`. | Pinaro |
| 1:00–1:30 | **Temario.** Correr `/nuevo-curso <slug>` en Claude Code. Primero propone el temario (módulos, lecciones, duración, calculadoras o checklists posibles, caso práctico conductor). | Claude Code + Pinaro |
| 1:30–2:00 | **Validación del temario con el docente** (llamada corta o mensaje). Ajustes. | Docente |
| 2:00–4:30 | **Generación.** Claude Code escribe `course.json`, las lecciones MDX, los quizzes por módulo, el examen final (banco de 1,5× a 2× preguntas) y los recursos descargables. | Claude Code |
| 4:30–5:00 | `pnpm courses:validate` → corregir. `pnpm courses:sync` en local. Revisión propia en el reproductor (desktop y mobile). | Pinaro |
| 5:00–6:30 | **Revisión del docente** con el link de vista previa firmado. El docente marca errores técnicos y ajustes de tono. | Docente |
| 6:30–7:30 | Correcciones, videos subidos a YouTube (no listado) o Vimeo y URLs cargadas, portada si la hay. | Pinaro |
| 7:30–8:00 | PR → merge → deploy (el build corre `courses:sync`) → asignar a la cámara con precios y categoría → publicar → notificar a la lista de espera. | Pinaro |

## 3. Criterios de calidad del contenido

Cada curso, antes de publicarse, cumple:

- [ ] Hay un **caso práctico conductor**: una empresa ficticia que atraviesa todo el curso, con números coherentes entre lecciones.
- [ ] Cada lección se puede leer en **10 a 20 minutos** y termina con una idea accionable ("Qué hacer el lunes").
- [ ] Al menos **una interacción por módulo**: calculadora, checklist o quiz.
- [ ] Las cifras que dependen de la coyuntura (tarifas, normativa, programas de financiamiento) están marcadas como **ilustrativas** o con la fecha de referencia, y el texto invita a verificarlas.
- [ ] Nada de afirmaciones técnicas sin respaldo: si el docente no lo valida, no va.
- [ ] Lenguaje claro, voseo, sin jerga innecesaria; los términos técnicos se explican la primera vez.
- [ ] El examen evalúa **comprensión y aplicación**, no memoria de cifras. Cada pregunta tiene su explicación.
- [ ] Ninguna pregunta del examen se responde copiando una frase literal de una lección.
- [ ] Todos los recursos descargables abren y sirven solos (con instrucciones adentro).
- [ ] `courses:validate` sin errores y con los warnings revisados.

## 4. Reutilización entre cámaras

- Un curso de biblioteca (`owner_tenant_id = null`) se escribe **sin mencionar a ninguna cámara**. El nombre de la cámara aparece solo en la interfaz y en el certificado.
- Si una cámara quiere una versión adaptada (otro caso práctico, su normativa local), se copia la carpeta con otro `slug` y se asigna como curso propio de esa cámara (`owner_tenant_id`).

## 5. Métricas del proceso

Registrar por curso: horas totales invertidas, cantidad de rondas de revisión y tiempo desde el relevamiento hasta la publicación. El objetivo es bajar de 8 a 5 horas por curso después de los primeros cinco.
