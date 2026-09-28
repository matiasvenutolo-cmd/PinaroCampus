# 09 — Demo y datos semilla

La demo tiene que verse **viva**: con alumnos, progreso, ventas y certificados. Todo es ficticio. **No usar nombres de cámaras, empresas ni personas reales.**

`pnpm db:seed` es idempotente (upsert por claves naturales). `pnpm demo:reset` borra y regenera solo los datos de los tenants `is_demo`. Las fechas se generan **relativas a hoy** (por ejemplo, inscripciones repartidas en los últimos 90 días), así la demo siempre se ve reciente.

## Cámaras ficticias

### 1. Cámara Industrial Valle Azul — `civa` (principal de la demo)
- `campus_name`: "Campus CIVA"
- Dominios: `plataforma.pinaro.ar` (primario en producción), `civa.localhost:3000` (dev)
- Theme: primario `#1E4FA3` (azul industrial), acento `#F2A900` (ámbar)
- Logo: generar un SVG simple (monograma "CIVA" en un hexágono) y guardarlo en `public/demo/civa-logo.svg`
- `member_validation_mode`: `cuit`
- `collection_mode`: `platform_account`, `platform_fee_bps`: 3000
- `payment_methods`: `mock`, `manual`, `mercadopago`
- `manual_payment_instructions`: "Transferí a la cuenta de la Cámara. Alias: CIVA.CAMPUS.DEMO · Titular: Cámara Industrial Valle Azul · CUIT <CUIT ficticio generado por el seed>. Enviá el comprobante a campus@civa.demo indicando el número de orden."
- Home: heroTitle "Capacitación para la industria del Valle", heroSubtitle "Cursos prácticos pensados para las empresas socias de la Cámara. Cursá a tu ritmo y obtené un certificado verificable."
- Certificado: firmantes "Ing. Laura Benítez — Presidenta" y "Lic. Diego Salvatierra — Coordinador de Capacitación" (ficticios, con firmas SVG manuscritas simples generadas)
- `is_demo`: true

### 2. Centro Empresario Ribera — `ribera` (para mostrar marca blanca)
- `campus_name`: "Aula Ribera"
- Dominios: `ribera.localhost:3000` (dev); en producción se accede con "Ver como" desde el superadmin
- Theme: primario `#0F7B5F` (verde), acento `#E4572E` (coral)
- Logo: SVG simple (ola estilizada + "RIBERA") en `public/demo/ribera-logo.svg`
- `member_validation_mode`: `cuit_email_domain`
- `collection_mode`: `tenant_account`, `platform_fee_bps`: 5000
- `payment_methods`: `mock`, `manual` (MP cuando conecte la cuenta de prueba)
- `is_demo`: true

## Usuarios

| Email | Rol | Notas |
|---|---|---|
| `SEED_SUPERADMIN_EMAIL` | superadmin | email real de Matías (variable de entorno) |
| `admin@civa.demo` | tenant_admin en CIVA | "Admin de la cámara" del botón de `/demo` |
| `admin@ribera.demo` | tenant_admin en Ribera | |
| `alumno@civa.demo` | student en CIVA | socio verificado (Talleres Brisco), inscripto al curso de energía con 40% de avance. Botón "Entrar como alumno" |
| `avanzado@civa.demo` | student en CIVA | socio verificado, 100% de lecciones, examen pendiente. Botón "Alumno con curso avanzado" (para mostrar examen + certificado en vivo) |
| 25 alumnos más en CIVA, 8 en Ribera | student | nombres argentinos comunes generados (sin coincidir con figuras públicas), emails `nombre.apellido@<dominio-de-la-empresa>.demo` |

Los dominios `.demo` no reciben email. Usar un proveedor de email de desarrollo o loguear los emails en consola cuando el destinatario termina en `.demo`, y mostrar en el panel de superadmin los últimos 50 emails "enviados" (tabla `email_log` opcional, útil también para soporte).

## Empresas (padrón de CIVA)

CUITs ficticios **generados por el seed** con dígito verificador válido, con prefijo `30-99`:

| Empresa | Socia | Dominio de email |
|---|---|---|
| Talleres Brisco S.A. | sí | talleresbrisco.demo |
| Fundición Los Aromos S.R.L. | sí | losaromos.demo |
| Plásticos Del Arroyo S.A. | sí | delarroyo.demo |
| Metalmecánica Quintana Hnos. | sí | quintanahnos.demo |
| Alimentos Santa Brígida S.A. | sí | santabrigida.demo |
| Envases Pampa Norte S.R.L. | no (padrón, socia dada de baja) | pampanorte.demo |
| Tornería Ferrari & Cía. | — (`self_declared`, no está en el padrón) | ferrari.demo |

Ribera: 4 empresas equivalentes con otros nombres ficticios (comercios y servicios).

## Categorías (ambas cámaras)

Energía y sustentabilidad (`zap`) · Seguridad e higiene (`hard-hat`) · Gestión y liderazgo (`users`) · Tecnología e IA (`cpu`) · Comercio exterior (`globe`) · Costos y finanzas (`calculator`).

## Cursos

1. **Eficiencia energética para PyMEs industriales** (`published`, el curso de `content/courses/`).
   - CIVA: socio $ 45.000 / no socio $ 90.000, destacado.
   - Ribera: socio $ 0 (bonificado para socios) / no socio $ 60.000.
2. Cursos `coming_soon` (solo `course.json` mínimo con título, subtítulo, descripción, un módulo con una lección "Contenido en preparación" y `status: "coming_soon"`), generados en `content/courses/` por el seed de la Fase 2:
   - Seguridad e higiene en planta: lo esencial (Seguridad e higiene)
   - Liderazgo para mandos medios (Gestión y liderazgo)
   - Inteligencia artificial aplicada a la PyME (Tecnología e IA)
   - Costos industriales para tomar decisiones (Costos y finanzas)
   - Exportar por primera vez (Comercio exterior)
   - Precios de referencia para mostrar: entre $ 35.000 y $ 80.000 (socio 50% menos).

## Actividad simulada (CIVA)

- 22 inscripciones al curso de energía en los últimos 90 días, con distribución de progreso: 5 al 0-10%, 8 al 20-60%, 4 al 70-99%, 5 completados.
- 5 certificados emitidos (notas entre 72 y 96).
- 1 alumno con examen desaprobado (nota 60) y 2 intentos restantes.
- Órdenes: 14 individuales pagadas (mock), 1 transferencia pendiente de hace 2 días, 1 rechazada, 1 vencida.
- 1 paquete de 10 vacantes pagado por Fundición Los Aromos: 6 canjeados (con distinto progreso), 2 enviados sin canjear, 2 disponibles.
- 1 paquete de 5 vacantes creado por el admin sin orden (para Metalmecánica Quintana), 3 canjeados.
- 12 entradas en la lista de espera repartidas entre los cursos "Próximamente" (la más pedida: IA aplicada a la PyME).
- 1 socio pendiente de aprobación (en Ribera, por el modo `cuit_email_domain`).
- `lesson_progress` con `last_viewed_at` realistas para que "activos en los últimos 30 días" dé un número razonable.
- 1 liquidación `paid` del mes anterior y el mes en curso sin liquidar.

## Guion sugerido de la demo (para `docs/OPERACION.md`)

1. Abrir `plataforma.pinaro.ar`: home con la marca de CIVA.
2. `/demo` → "Entrar como alumno": Mi campus, continuar el curso, mostrar una lección con calculadora (fugas de aire).
3. Detalle del curso → "Comprar para mi equipo" → 5 vacantes → pago simulado → aprobado → códigos → enviar uno.
4. Salir → "Alumno con curso avanzado" → rendir el examen → certificado → escanear el QR con el celular → verificación.
5. "Admin de la cámara" → dashboard, reporte por empresa, marcar una transferencia pagada.
6. Superadmin → "Ver como" Ribera: la misma plataforma con otra marca, en un clic. Cerrar con: "Tu cámara, con tus colores, en tu dominio, en una semana".
