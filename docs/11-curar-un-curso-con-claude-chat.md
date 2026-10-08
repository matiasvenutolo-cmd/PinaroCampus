# 11 — Curar un curso en Claude chat y pasárselo a Claude Code

Sirve para cuando el material crudo (PDF, apuntes) todavía hay que ordenarlo y decidir qué entra. Se itera en el chat, sin gastar sesiones de código, y recién al final se le pasa a Claude Code un documento cerrado que él convierte al formato de la plataforma (`docs/05`), valida (`pnpm courses:validate`) y publica.

## Flujo

1. En un chat nuevo de Claude, adjuntá los PDF y pegá el **prompt de abajo** (completá lo que va entre `<…>`).
2. El chat te devuelve primero **solo el temario** (parte B). Corregilo hasta que te guste. Recién ahí pedile el resto: «Seguí con lo que falta, parte por parte».
3. Cuando tengas todo, guardalo como **un solo archivo** (`curso.md`) y pasámelo junto con los PDF originales (para chequear cifras) y los datos de marca de la empresa (nombre del campus, logo, dos colores, firmantes del certificado).
4. Yo lo convierto, lo valido, te muestro el curso en el reproductor y te marco **qué afirmaciones tiene que validar alguien que sepa del tema** antes de publicar.

El chat **no** tiene que escribir `course.json`, MDX ni JSON de evaluaciones: eso falla si no sigue el formato al pie de la letra y lo hago yo con el validador.

## Prompt para pegar en el chat

```
Sos diseñador instruccional. Te adjunto material crudo (PDF) de <empresa o cámara / tema>.
Quiero convertirlo en un curso online autoguiado para <público: p. ej. supervisores de planta>,
nivel <inicial | intermedio | avanzado>, de <X> horas, en español rioplatense con voseo.
Objetivo: que al terminar la persona sepa <objetivo en una frase>.

REGLAS
- Usá SOLO lo que dice el material. Si el objetivo necesita algo que el material no cubre, no lo inventes:
  anotalo en "Huecos y cosas a validar".
- No menciones empresas ni personas reales en el contenido del curso (solo en el caso práctico ficticio).
- Cifras que dependan de la coyuntura (tarifas, normativa, plazos): marcalas "ilustrativas" y con fecha de referencia.
- Lenguaje claro, sin jerga innecesaria; explicá cada término técnico la primera vez.
- No copies frases literales del material.

DEVOLVEME ESTO, EN ESTE ORDEN, y frená después de la parte B para que yo lo apruebe:

A. FICHA
   Título · subtítulo · descripción (2 párrafos) · público · nivel · duración total · requisitos previos ·
   4 a 6 "Qué vas a aprender" (verbos de acción) · horas de certificado · categoría sugerida.

B. TEMARIO
   3 a 6 módulos. Por cada lección: título · tipo (lectura / video / recurso / repaso) · duración en minutos (10 a 20 por lectura) ·
   1 línea de contenido · de qué parte del material sale (archivo y página).
   Una lección de recursos descargables por módulo cuando tenga sentido. Un repaso (quiz) al final de cada módulo.

C. CASO PRÁCTICO CONDUCTOR
   Una empresa ficticia (rubro, tamaño, 6 a 10 datos con números) que atraviesa TODO el curso,
   y en qué lección aparece cada dato. Los números tienen que ser coherentes entre lecciones.

D. LECCIONES (después de mi OK al temario)
   Una por una, en markdown simple: títulos con ## y ###, nunca #; 600 a 1.200 palabras; tablas con | si hacen falta.
   Cada lección termina con "## Qué hacer el lunes" y 3 a 5 acciones concretas.
   Cuando una lección pida algo interactivo, marcalo con una línea así, sin inventar otros formatos:
     [CUADRO: info|consejo|atención|caso — título — texto]
     [CIFRAS: valor — etiqueta; valor — etiqueta]            (2 a 4 cifras destacadas)
     [PASOS: paso 1 — detalle; paso 2 — detalle]
     [LISTA TILDABLE: ítem; ítem; ítem]
     [CALCULADORA NUEVA: nombre — datos de entrada con valor por defecto — fórmula — cómo se explica el resultado]
   Al menos una interacción por módulo.

E. EVALUACIÓN
   - Repaso por módulo: 4 a 6 preguntas.
   - Examen final: un banco de 1,5 a 2 veces la cantidad que se sortea (si se sortean 15, escribí 24 a 30).
   Evaluá comprensión y aplicación (situaciones del caso práctico o casos nuevos), no memoria de cifras.
   Ninguna pregunta se responde copiando una frase de una lección. Mezclá tipos.
   Formato fijo de cada pregunta:
     ID: m1-q1 (o ef-01 para el examen) · Tipo: única | múltiple | verdadero/falso
     Enunciado: …
     Opciones: a) … b) … c) … d) …            (no va en verdadero/falso)
     Correcta/s: b            (en múltiple, al menos dos correctas y una incorrecta)
     Explicación: por qué es esa y por qué las otras no.

F. RECURSOS DESCARGABLES
   2 a 4 plantillas útiles (planilla, checklist, formato) con las columnas o campos y las instrucciones de uso.

G. HUECOS Y COSAS A VALIDAR
   - Temas que el objetivo requiere y el material no cubre.
   - Cada afirmación técnica, cifra o norma que tiene que revisar una persona experta, con la lección donde aparece.
   - Contradicciones entre partes del material.
```

## Lo que conviene que cuides en el chat

- **Un caso práctico con números** vale más que mucha teoría: es lo que hace que el curso se sienta hecho a medida.
- **Los PDF escaneados** (imágenes) hay que pasarlos por OCR antes; si el chat no puede leerlos, decímelo y los convierto yo.
- **Las preguntas** son lo que más se nota: pedile al chat que las revise contra el criterio «¿se responde copiando una frase?» y que reescriba las que sí.
- **No pidas videos**: si no hay, las lecciones de video quedan con el guion y el aviso «Video en producción».
