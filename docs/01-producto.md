# 01 — Producto

## Visión

Las cámaras empresarias tienen una relación directa con cientos de empresas socias, pero casi ninguna tiene una plataforma propia de capacitación. Pinaro les da una **plataforma educativa con su marca**, lista para vender cursos a sus socios, sin que la cámara tenga que desarrollar ni mantener nada.

Para Pinaro es un producto escalable:

- **Cámara nueva = configuración.** Un registro en la base, un dominio, logo y colores. Sin desarrollo.
- **Curso nuevo = un día.** El contenido tiene un formato estándar y hay un proceso asistido por IA para convertir el material de la cámara en un curso (ver `10-pipeline-de-cursos.md`).
- **Biblioteca compartida.** Un curso que arma Pinaro (como el de eficiencia energética) se puede licenciar a muchas cámaras a la vez.

## Modelos comerciales que la plataforma tiene que soportar

Se configuran por cámara, sin tocar código:

| Modelo | Quién cobra | Qué recibe Pinaro | Configuración |
|---|---|---|---|
| **Setup fee** | La cámara, con su cuenta de Mercado Pago | Un pago por armado/mantenimiento, fuera de la plataforma | `collection_mode = tenant_account`, `platform_fee_bps = 0` |
| **Revenue share automático** | La cámara, con su cuenta de MP | Un % de cada venta, retenido automáticamente por MP (`marketplace_fee`) | `collection_mode = tenant_account`, `platform_fee_bps = 5000` (50%) |
| **Pinaro cobra todo** | Pinaro, con su cuenta de MP | Su %; el resto se le liquida a la cámara | `collection_mode = platform_account`, `platform_fee_bps = N`; hay reporte de liquidaciones |

En todos los casos existe además el **pago manual** (transferencia): el alumno o la empresa ve los datos bancarios de la cámara y un admin marca la orden como pagada.

**La plataforma no factura.** Solo registra el cobro. Cada parte factura por fuera.

## Roles

| Rol | Alcance | Qué puede hacer |
|---|---|---|
| **Superadmin** (Pinaro) | Global | Crear y configurar cámaras y dominios, asignar cursos de la biblioteca a cámaras, nombrar admins de cámara, "ver como" cualquier cámara, ver métricas globales y liquidaciones, generar links de vista previa de cursos. |
| **Admin de cámara** | Su cámara | Configurar marca, precios, categorías, visibilidad de cursos, padrón de empresas, validación de socios, cobros (conectar MP, datos de transferencia), firmas del certificado. Ver alumnos, órdenes, pagos y reportes. Marcar pagos manuales, crear códigos de vacantes, inscribir alumnos a mano, revocar certificados. |
| **Alumno** | Su cámara | Registrarse, comprar cursos para sí, comprar vacantes para su equipo, canjear códigos, cursar, rendir, descargar certificados. |

Un mismo usuario (email) puede ser alumno en varias cámaras; su pertenencia es independiente en cada una (`tenant_memberships`).

**Fuera de alcance en v1: el admin de empresa.** Una empresa no tiene panel propio. Lo que sí existe:
- Cada alumno queda asociado a una **empresa del padrón** (por CUIT), lo que permite precio de socio y reportes por empresa para la cámara.
- Cualquier alumno puede **comprar un paquete de vacantes** para su equipo. En "Mis compras" ve los códigos generados, a quién se los mandó y cuáles se canjearon. Es la vista del comprador sobre su orden, no un rol.

El modelo de datos tiene que dejar la puerta abierta para agregar el admin de empresa después (la relación alumno → empresa ya existe).

## Socios y precios

- Cada cámara carga su **padrón de empresas** (CSV: CUIT, razón social, nombre de fantasía, socio sí/no, dominios de email opcionales).
- Cada curso asignado a una cámara tiene **precio socio** y **precio no socio** (cualquiera de los dos puede ser 0 → gratis).
- El alumno, al registrarse, indica el **CUIT de su empresa** (opcional). El estado de socio se resuelve según el **modo de validación** de la cámara:

| Modo | Regla |
|---|---|
| `open` | No hay distinción; todos pagan el precio no socio. El campo de CUIT se pide igual para los reportes. |
| `cuit` | Si el CUIT está en el padrón y la empresa es socia activa → socio verificado automáticamente. |
| `cuit_email_domain` | Como `cuit`, pero además el dominio del email tiene que estar en `email_domains` de la empresa. Si el CUIT coincide y el dominio no, queda `pending` y un admin lo aprueba o rechaza. |
| `manual` | Todo pedido de socio queda `pending` hasta que un admin lo aprueba. |

- Si el CUIT no está en el padrón, se guarda igual (se crea la empresa con `is_member = false`) para que la cámara vea **qué empresas no socias usan la plataforma**: es un dato comercial valioso para la cámara.
- El precio se calcula **siempre en el servidor** (`src/lib/pricing.ts`) al crear la orden y queda fijado en la orden.

## Flujos principales

### 1. Alumno compra un curso para sí

1. Entra a `plataforma.<camara>` → catálogo → detalle del curso (temario, duración, docente, precio socio/no socio, certificado).
2. "Inscribirme" → si no tiene sesión, login por magic link → onboarding si es su primer ingreso en esta cámara (nombre, apellido, DNI opcional para el certificado, CUIT de su empresa, cargo opcional, aceptación de términos y privacidad).
3. Se crea una orden `individual` con el precio que le corresponde. Si el precio es 0 → inscripción inmediata.
4. Elige medio de pago (los que la cámara tenga habilitados: Mercado Pago, transferencia; en demo, "Pago simulado").
5. Pago aprobado → inscripción creada → email de confirmación → redirige al curso.
6. Transferencia → la orden queda `awaiting_payment` con las instrucciones; cuando el admin la marca pagada, se crea la inscripción y se envía el email.

### 2. Empresa compra vacantes para su equipo

1. Desde el detalle del curso: "Comprar para mi equipo" → cantidad de vacantes (mínimo 2, máximo configurable, por defecto 200) + CUIT de la empresa (se precarga el del comprador).
2. El precio unitario depende de si la empresa del CUIT es socia (según el modo de validación de la cámara; en `cuit_email_domain` y `manual`, el comprador tiene que ser socio verificado de esa empresa para acceder al precio de socio).
3. Pago igual que el flujo 1.
4. Al aprobarse: se generan N **códigos de vacante** (`XXXX-XXXX`, sin caracteres ambiguos) y se muestran en "Mis compras". El comprador puede:
   - Copiar los códigos o descargarlos en CSV.
   - Cargar emails (uno por línea o pegando desde Excel) y enviar un código a cada uno desde la plataforma.
   - Ver el estado de cada código: disponible, enviado a X, canjeado por Y (con progreso del curso).
5. El empleado entra a `/canjear` (o al link del mail, que trae el código precargado), inicia sesión, completa el onboarding y queda inscripto. Su empresa queda asociada a la empresa del comprador.
6. El comprador **no** necesita cursar. Si también quiere, usa uno de los códigos.

### 3. Alumno cursa y se certifica

1. "Mi campus" → sus cursos con barra de progreso y botón "Continuar".
2. Reproductor: temario lateral por módulos, lección actual, botones anterior/siguiente, "Marcar como completada".
3. Tipos de lección: texto (MDX con componentes interactivos), video, recurso descargable, quiz de práctica (no bloquea) y examen final.
4. Regla de aprobación (configurable por curso): todas las lecciones obligatorias completas + examen final ≥ nota mínima.
5. Se emite el certificado automáticamente → email con link de descarga → aparece en "Mis certificados".
6. El certificado tiene un QR que lleva a `/verificar/<código>`, página pública que confirma su validez.

### 4. La cámara administra

- Dashboard con KPIs: inscriptos, alumnos activos (últimos 30 días), cursos completados, tasa de finalización, certificados emitidos, ingresos del período (bruto, comisión Pinaro, neto).
- Reportes: por curso, por empresa (cuántos empleados inscriptos, cuántos certificados), por alumno. Todos exportables a CSV.
- Gestión: cursos (precio, categoría, visibilidad, destacado, orden, abrir/cerrar inscripción), categorías, padrón (importar CSV, alta manual, editar), socios pendientes de aprobación, alumnos (ver detalle, inscribir a mano, dar de baja), órdenes y pagos (marcar pagada la transferencia, cancelar), vacantes (crear códigos sin orden, por ejemplo para una empresa que pagó por fuera), certificados (buscar, reenviar, revocar).
- Configuración: marca (nombre, logo, favicon, colores con preview y chequeo de contraste), textos del home, email de contacto, cobros (conectar/desconectar Mercado Pago, datos de transferencia), firmas y texto del certificado, modo de validación de socios, términos propios opcionales.

### 5. Pinaro administra

- Alta de cámara con asistente: datos básicos → marca → dominio(s) → modelo de cobro → primer admin (por email) → cursos de la biblioteca a asignar con precios iniciales.
- Lista de cámaras con KPIs y estado; "ver como" (previsualiza el sitio de esa cámara con su marca sin cambiar de dominio).
- Biblioteca de cursos: estado de sincronización, versión (hash del contenido), a qué cámaras está asignado cada uno, link de vista previa firmado para docentes.
- Liquidaciones (solo cámaras en `platform_account`): por período, bruto, comisión y neto a transferir; marcar liquidación como pagada con referencia.
- Métricas globales: cámaras activas, alumnos totales, ventas por cámara, comisiones del mes.

### 6. Lista de espera ("Próximamente")

Los cursos en estado `coming_soon` se muestran en el catálogo con la etiqueta "Próximamente" y un botón "Avisame cuando esté". El botón guarda email, empresa y curso en una lista de espera que la cámara ve y exporta. Sirve para medir demanda antes de producir un curso.

## Emails transaccionales

Todos con la marca de la cámara (logo y color), enviados desde la dirección de la plataforma con `reply-to` al email de contacto de la cámara:

1. Link de ingreso (magic link)
2. Bienvenida (primer ingreso a la cámara)
3. Inscripción confirmada
4. Orden pendiente de transferencia (con instrucciones)
5. Pago aprobado / rechazado
6. Códigos de vacante listos (al comprador)
7. Te regalaron una vacante (al empleado, con el código y el link)
8. Certificado emitido
9. Socio aprobado / rechazado
10. Curso disponible (a la lista de espera, disparado por el admin)

## Requisitos no funcionales

- **Mobile first.** Muchos empleados de planta van a cursar desde el celular.
- **Accesibilidad AA:** contraste, foco visible, navegación por teclado, textos alternativos.
- **Rendimiento:** catálogo y detalle de curso renderizados en el servidor y cacheados por tenant; LCP < 2,5 s en 4G.
- **Datos personales (Ley 25.326):** política de privacidad por cámara (plantilla editable), consentimiento explícito en el onboarding, posibilidad de que el alumno descargue sus datos y pida la baja (v1: botón que genera un pedido para el admin).
- **Auditoría:** acciones sensibles (marcar pagos, revocar certificados, cambiar precios, cambiar configuración de cobros, aprobar socios) quedan en `audit_log`.
