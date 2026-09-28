# 06 — Certificados

## Emisión

- **Disparador:** después de guardar el progreso de una lección o el resultado de un examen, `src/lib/certificates/issue.ts → maybeIssueCertificate(enrollmentId)` evalúa la regla de `completion` del curso:
  - Todas las lecciones obligatorias no archivadas completas (si `requireAllRequiredLessons`).
  - El examen final (`finalAssessment`) aprobado en algún intento.
- Si se cumple y el curso tiene `certificate.enabled`, se emite en una transacción:
  - `enrollment.status = completed`, `completed_at = now`.
  - Se crea `certificates` con snapshot (nombre y DNI del alumno, título del curso, horas, nota del mejor intento aprobado, nombre y logo de la cámara, firmantes, texto de pie).
- Si al alumno le falta el nombre o el apellido, se le pide antes de emitir ("¿Cómo querés que figure tu nombre en el certificado?"). Una vez emitido, el nombre queda fijo. Si hay un error, el admin puede **reemitir**: revoca el anterior con motivo y emite uno nuevo con otro código.
- Email "¡Aprobaste!" con el link de descarga.
- La emisión es **idempotente** (unique en `enrollment_id`).

## Código

- Formato `PC-XXXX-XXXX` (alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`), generado con `crypto.randomInt`, con reintento ante colisión.
- Se imprime en el certificado y va dentro del QR.

## PDF

- `@react-pdf/renderer`, A4 **apaisado**, en `src/lib/certificates/pdf.tsx`.
- Se genera bajo demanda en `GET /api/certificates/[code]/pdf` y se cachea en Vercel Blob (`pdf_url`). Si el certificado se revoca, se borra el cache y el endpoint devuelve 410.
- Acceso: el titular, los admins de la cámara y el superadmin. La verificación pública **no** entrega el PDF, solo los datos.
- Fuentes: Geist (o Inter) registrada en react-pdf, con los archivos de fuente dentro del repo.

### Diseño

```
┌─────────────────────────────────────────────────────────────────────┐
│ [logo cámara]                                     CERTIFICADO DE     │
│                                                    APROBACIÓN         │
│ ─────────────── (franja fina con el color primario) ─────────────── │
│                                                                     │
│   La Cámara Industrial Valle Azul certifica que                     │
│                                                                     │
│          MARÍA FERNANDA GÓMEZ                                        │
│          DNI 30.123.456   (si showDni y hay DNI)                     │
│                                                                     │
│   aprobó el curso                                                    │
│          Eficiencia energética para PyMEs industriales               │
│   con una carga horaria de 6 horas, el 14 de octubre de 2026,        │
│   con una calificación de 87/100.                                   │
│                                                                     │
│   ____________________        ____________________                  │
│   [firma img]                  [firma img]                          │
│   Nombre firmante 1            Nombre firmante 2                    │
│   Cargo                        Cargo                                │
│                                                                     │
│ [QR]  Verificá este certificado en                                   │
│       plataforma.pinaro.ar/verificar/PC-7K3M-Q9TD                    │
│       Código: PC-7K3M-Q9TD          Plataforma provista por Pinaro   │
└─────────────────────────────────────────────────────────────────────┘
```

- De 1 a 3 firmantes según `certificate_config.signatories`. Sin imagen de firma → solo la línea.
- `footerText` opcional (por ejemplo, "Actividad de capacitación de la Cámara…").
- Fechas en español: "14 de octubre de 2026".
- El texto "Plataforma provista por Pinaro" va chico, en gris.

## Verificación pública: `/verificar/[code]`

- Página pública en el dominio de la cámara, sin login, con `noindex`.
- Estados:
  - **Válido:** check verde, nombre (en v1 completo; evaluar mostrar solo iniciales del apellido si la cámara lo pide), curso, horas, fecha, cámara emisora.
  - **Revocado:** aviso rojo con la fecha de revocación (sin el motivo).
  - **Inexistente:** "No encontramos un certificado con ese código".
- Si se consulta desde otro dominio que no es el de la cámara emisora, igual valida y muestra la cámara emisora (la búsqueda por código es global), pero con la marca del host actual.
- Formulario "Verificar otro código".

## En la interfaz del alumno

- "Mis certificados": tarjetas con curso, fecha y los botones **Descargar PDF**, **Copiar link de verificación** y **Compartir en LinkedIn** (link a "Agregar licencia o certificación" con los parámetros prellenados: nombre, organización, fecha de emisión, id y URL de verificación).

## En el panel de la cámara

- Lista con búsqueda por nombre, DNI, empresa, curso o código; filtros por curso y fecha.
- Acciones: descargar, reenviar email, revocar (con motivo obligatorio, a `audit_log`), reemitir.
- Export CSV.
