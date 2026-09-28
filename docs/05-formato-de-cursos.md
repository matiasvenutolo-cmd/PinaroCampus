# 05 — Formato de cursos

Un curso es una **carpeta** en `content/courses/<slug>/`. Todo lo que la plataforma necesita para mostrarlo, hacer seguimiento del progreso, evaluar y certificar está en esa carpeta. Este formato es lo que permite producir un curso en un día: el trabajo es escribir contenido, no programar.

## Estructura

```
content/courses/<slug>/
  course.json                 # metadatos y estructura (obligatorio)
  lessons/*.mdx               # cuerpo de las lecciones
  assessments/*.json          # quizzes y examen final
  resources/*                 # descargables (csv, xlsx, pdf)
  assets/*                    # imágenes usadas en las lecciones
  cover.(svg|jpg|png)         # opcional; si falta, se genera una portada con el color de la cámara
```

## `course.json`

```jsonc
{
  "schemaVersion": 1,
  "slug": "eficiencia-energetica-pymes-industriales",   // = nombre de la carpeta
  "status": "published",                               // draft | coming_soon | published
  "title": "Eficiencia energética para PyMEs industriales",
  "subtitle": "…",
  "description": "…",                                  // markdown corto (2 o 3 párrafos)
  "level": "inicial",                                  // inicial | intermedio | avanzado
  "language": "es-AR",
  "durationMinutes": 360,
  "suggestedCategory": { "slug": "energia-y-sustentabilidad", "name": "Energía y sustentabilidad" },
  "tags": ["energía", "costos", "industria"],
  "cover": null,
  "instructors": [{ "name": "…", "bio": "…", "photo": null }],
  "outcomes": ["…"],                                    // "Al terminar vas a poder…"
  "audience": ["…"],
  "prerequisites": ["…"],
  "certificate": { "enabled": true, "hours": 6, "title": "Certificado de aprobación" },
  "completion": { "requireAllRequiredLessons": true, "finalAssessment": "examen-final" },
  "modules": [
    {
      "id": "m1",
      "title": "…",
      "summary": "…",
      "lessons": [
        { "id": "m1-l1", "type": "text", "title": "…", "durationMinutes": 15, "file": "lessons/m1-l1-….mdx" },
        { "id": "m1-video", "type": "video", "title": "…", "durationMinutes": 4,
          "video": { "provider": "youtube", "url": null }, "file": "lessons/m1-video-guion.mdx" },
        { "id": "m1-recursos", "type": "resource", "title": "…", "durationMinutes": 10,
          "file": "lessons/m1-recursos.mdx",
          "resources": [{ "title": "…", "file": "resources/….csv", "description": "…" }] },
        { "id": "m1-quiz", "type": "quiz", "title": "…", "durationMinutes": 5, "assessment": "m1-quiz" }
      ]
    }
  ]
}
```

### Reglas

- `id` de módulos, lecciones y evaluaciones: `kebab-case`, únicos en el curso y **estables para siempre**. Para reemplazar una lección, se crea otra con otro `id`; la vieja se quita del JSON y el sync la archiva.
- `required`: por defecto `true` para `text`, `video` y `resource`, y `false` para `quiz`. El `exam` referenciado en `completion.finalAssessment` es siempre obligatorio.
- Tipo `video`: si `url` es `null`, el reproductor muestra el `file` (guion o transcripción) como lección de texto, con un aviso discreto "Video en producción". Cuando `url` tiene valor, muestra el video embebido (YouTube con `youtube-nocookie.com`, o Vimeo) y el `file` abajo como "Transcripción" plegable.
- Tipo `resource`: muestra el MDX y una lista de descargas. Los archivos de `resources/` se suben a Vercel Blob en el sync (o se sirven desde `public/` copiados en el build; elegir uno y documentarlo).
- `durationMinutes` del curso: el validador avisa (warning, no error) si difiere más del 20% de la suma de las lecciones.

## Lecciones MDX

Markdown con GitHub Flavored Markdown (tablas, listas de tareas) más una **lista cerrada** de componentes. Cualquier otro componente o `import`/`export` en el MDX hace fallar a `courses:validate`.

Sin frontmatter: el título sale de `course.json`. El MDX **no** repite el título como `# H1`; arranca directo con el contenido y usa `##` y `###`.

### Componentes permitidos

| Componente | Uso |
|---|---|
| `<Callout type="info\|tip\|warning\|case" title="…">…</Callout>` | Recuadros. `case` = caso práctico (estilo distinto, ícono de fábrica). |
| `<KeyFigures>` + `<KeyFigure value="…" label="…" />` | Grilla de cifras grandes (2 a 4 por grilla). |
| `<Steps>` + `<Step title="…">…</Step>` | Pasos numerados. |
| `<Accordion>` + `<AccordionItem title="…">…</AccordionItem>` | Contenido plegable (profundización, preguntas frecuentes). |
| `<Checklist id="…" items={["…", "…"]} />` | Lista tildable. El estado se guarda en `lesson_progress.meta.checklists[id]`. |
| `<Calculator id="…" />` | Calculadora interactiva (ver abajo). |
| `<Figure src="assets/…" alt="…" caption="…" />` | Imagen con epígrafe. |
| `<Download file="resources/…" label="…" />` | Botón de descarga en línea. |
| `<Formula>…</Formula>` | Fórmula destacada en bloque (texto plano o Unicode; sin LaTeX en v1). |

Todos los componentes se renderizan con los colores de la cámara (variables CSS del theme) y tienen que verse bien en mobile.

## Calculadoras

Las calculadoras son componentes cliente en `src/components/calculators/`, registrados por `id`. Cada una muestra inputs con valores por defecto (los del caso práctico del curso), recalcula en vivo y explica el resultado en una línea. Formateo con `Intl.NumberFormat('es-AR')`. Todas llevan la leyenda "Resultado estimado; usá los datos de tu planta y tu factura".

### `energy-cost` — Costo anual de un equipo
Inputs: potencia (kW, 15), factor de carga (%, 100), horas por día (16), días por año (264), precio de la energía ($/kWh, 150).
```
kWh/año = kW × (carga/100) × horas/día × días/año
$/año   = kWh/año × $/kWh
```
Mostrar también "equivale a X% de una factura de Y kWh/mes" si se completa el campo opcional "consumo mensual de la planta (kWh)".

### `vfd-savings` — Ahorro con variador de velocidad (cargas centrífugas: bombas y ventiladores)
Inputs: potencia absorbida hoy (kW, 15), horas/año (4224), reducción de velocidad (%, 20), eficiencia del variador (%, 97), precio ($/kWh, 150).
```
factor         = (1 − reducción/100)³
kW_con_VDF     = kW_hoy × factor / (efic/100)
ahorro_kW      = kW_hoy − kW_con_VDF
ahorro_kWh/año = ahorro_kW × horas/año
ahorro_$/año   = ahorro_kWh × $/kWh
```
Nota visible: "Aplica a bombas y ventiladores centrífugos (ley cúbica). En cargas de torque constante el ahorro es mucho menor."

### `air-leaks` — Costo de las fugas de aire comprimido
Inputs: cantidad de fugas de 1 mm (10), de 3 mm (2), de 5 mm (0), de 10 mm (0), horas/año con el compresor en marcha (4224), precio ($/kWh, 150).
Potencia de compresor desperdiciada por fuga (referencia aproximada a ~6 bar): 1 mm → 0,3 kW · 3 mm → 3,1 kW · 5 mm → 8,3 kW · 10 mm → 33 kW.
```
kW_perdidos = Σ(cantidad × kW_por_diámetro)
kWh/año     = kW_perdidos × horas/año
$/año       = kWh/año × $/kWh
```

### `capacitor-sizing` — Banco de capacitores para corregir el factor de potencia
Inputs: potencia activa (kW, 140), cos φ actual (0,88), cos φ objetivo (0,96).
```
kvar = kW × (tan(acos(φ_actual)) − tan(acos(φ_objetivo)))
```
Mostrar el resultado redondeado y sugerir el escalón comercial inmediato superior (múltiplos de 5 kvar). Nota: "El dimensionamiento final lo hace un profesional con mediciones de un analizador de redes."

### `payback` — Recupero de la inversión
Inputs: inversión ($, 4.500.000), ahorro anual ($, 4.487.000), vida útil (años, 10).
```
payback_años = inversión / ahorro_anual        → mostrar en años y meses
ahorro_neto  = ahorro_anual × vida_útil − inversión
```
Semáforo: < 1 año verde "Hacelo ya", 1 a 3 años amarillo "Muy conveniente", > 3 años gris "Evaluá financiamiento".

### `led-savings` — Recambio a LED
Inputs: cantidad de luminarias (120), potencia actual por luminaria con equipo auxiliar (W, 80), potencia LED equivalente (W, 36), horas/año (4224), precio ($/kWh, 150).
```
ahorro_kWh/año = cantidad × (W_actual − W_LED) / 1000 × horas/año
ahorro_$/año   = ahorro_kWh × $/kWh
```

## Evaluaciones: `assessments/<id>.json`

```jsonc
{
  "id": "examen-final",
  "kind": "exam",                   // quiz | exam
  "title": "Examen final",
  "description": "…",               // markdown corto que se muestra antes de empezar
  "passingScore": 70,               // null en quizzes de práctica
  "maxAttempts": 3,                 // null = ilimitados
  "cooldownMinutes": 60,
  "timeLimitMinutes": 30,           // null = sin límite
  "drawCount": 15,                  // null = todas
  "shuffleQuestions": true,
  "shuffleOptions": true,
  "showExplanations": "after_submit", // after_submit | after_pass | never
  "questions": [
    {
      "id": "ef-01",
      "type": "single",             // single | multiple | true_false
      "prompt": "…",                // markdown
      "options": [{ "id": "a", "text": "…" }, { "id": "b", "text": "…" }],
      "correct": ["b"],
      "explanation": "…"            // se muestra según showExplanations
    },
    { "id": "ef-02", "type": "true_false", "prompt": "…", "correct": ["false"], "explanation": "…" }
  ]
}
```

- `true_false` no lleva `options`: la plataforma muestra "Verdadero" / "Falso" con ids `true` / `false`.
- Corrección: `single` y `true_false` → acierto si coincide; `multiple` → acierto solo si el conjunto es exactamente igual (sin puntaje parcial). Nota = `round(100 × aciertos / preguntas)`.
- En los quizzes de práctica se muestran las explicaciones al enviar y se puede reintentar sin límite. Completar el quiz (enviarlo, con cualquier nota) marca la lección como completada.
- En el examen: sorteo de `drawCount` preguntas al iniciar el intento (guardado en `assessment_attempts`), temporizador visible si hay límite, confirmación antes de enviar, autoenvío al vencer el tiempo. Con `after_pass` las explicaciones se muestran solo cuando aprueba (para no regalar respuestas entre intentos).
- El cliente recibe preguntas y opciones **sin** `correct` ni `explanation` hasta enviar.

## Validador (`pnpm courses:validate`)

Errores (fallan CI):
- JSON que no cumple el schema Zod (`src/lib/courses/schema.ts`).
- `slug` distinto del nombre de la carpeta.
- `id` duplicados; archivos referenciados inexistentes; `assessment` inexistente.
- `correct` que no está entre las `options`; `single` con más de un correcto; `multiple` con menos de dos opciones correctas o sin ninguna incorrecta.
- `drawCount` > cantidad de preguntas.
- Componentes MDX fuera de la lista, `import`/`export` en MDX, `<Calculator id>` desconocido, `<Figure src>` o `<Download file>` inexistentes.
- `completion.finalAssessment` que no es de tipo `exam`.

Warnings:
- Duración declarada vs. suma de lecciones (> 20% de diferencia).
- Lección de texto de más de 1.500 palabras ("considerá dividirla").
- Examen con menos de 1,5× preguntas que `drawCount` (poca variación entre intentos).
- Pregunta sin `explanation`.

Salida legible, con la ruta del archivo y la línea cuando sea posible.
