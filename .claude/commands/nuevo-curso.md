---
description: Convierte el material crudo de inbox/<slug>/ en un curso con el formato de la plataforma
argument-hint: <slug-del-curso>
---

Vas a producir un curso nuevo para Pinaro Campus a partir del material crudo en `inbox/$ARGUMENTS/`.

## Antes de empezar

1. Leé `docs/05-formato-de-cursos.md` (formato obligatorio) y `docs/10-pipeline-de-cursos.md` (criterios de calidad).
2. Mirá `content/courses/eficiencia-energetica-pymes-industriales/` como **ejemplo de referencia** de estructura, tono, largo de lecciones, uso de componentes, caso práctico y estilo de preguntas.
3. Leé todo el material de `inbox/$ARGUMENTS/`, incluido `relevamiento.md` si existe (objetivo, público, duración, docente, horas del certificado). Si hay PPT, PDF o DOCX sin convertir, convertilos a texto primero.

## Paso 1 — Proponé el temario y frená

Devolveme, sin escribir archivos todavía:

- Título, subtítulo y una descripción de 2 párrafos.
- 4 a 6 "Qué vas a aprender" (outcomes) y el público.
- Módulos (3 a 6) con sus lecciones: título, tipo, duración estimada y 1 línea de contenido. Indicá de qué parte del material sale cada lección.
- El **caso práctico conductor** (empresa ficticia, rubro, tamaño, datos clave) y cómo aparece en cada módulo.
- Qué interacciones proponés por módulo: calculadoras existentes (`energy-cost`, `vfd-savings`, `air-leaks`, `capacitor-sizing`, `payback`, `led-savings`), checklists o calculadoras **nuevas** (si proponés una nueva, especificá inputs, fórmula y valores por defecto; su implementación es aparte).
- Huecos del material: temas que el objetivo requiere y el material no cubre, datos a verificar con el docente, afirmaciones dudosas.

Esperá mi OK o mis cambios.

## Paso 2 — Generá el curso

Con el temario aprobado, creá `content/courses/$ARGUMENTS/`:

- `course.json` completo y válido. `status: "draft"` hasta que el docente apruebe.
- `lessons/*.mdx`: 600 a 1.200 palabras por lección de texto, voseo, `##`/`###` (sin `#`), solo los componentes permitidos, al menos una interacción por módulo, cierre de cada lección con "Qué hacer el lunes" o equivalente. El caso práctico con números coherentes entre lecciones.
- Si hay video: lección `video` con `url: null` y el guion en el MDX (tono hablado, 2 a 5 minutos).
- `assessments/<modulo>-quiz.json`: 4 a 6 preguntas de práctica por módulo, con explicación.
- `assessments/examen-final.json`: banco de 1,5× a 2× el `drawCount`, preguntas de comprensión y aplicación (muchas sobre situaciones del caso práctico o casos nuevos), sin cifras para memorizar, todas con explicación. Mezclá tipos `single`, `multiple` y `true_false`.
- `resources/`: plantillas descargables útiles (CSV o XLSX) con instrucciones adentro.
- No menciones ninguna cámara ni empresa real.

## Paso 3 — Validá

1. `pnpm courses:validate` y corregí hasta 0 errores. Revisá cada warning.
2. Recalculá los números del caso práctico con un script rápido y corregí inconsistencias.
3. Revisá la checklist de calidad de `docs/10-pipeline-de-cursos.md` y reportame punto por punto.
4. Listame las **afirmaciones que el docente tiene que validar** (cifras, normativa, recomendaciones técnicas) con la lección donde aparecen.
