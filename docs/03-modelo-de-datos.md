# 03 — Modelo de datos

PostgreSQL + Drizzle. Todas las tablas tienen `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()` y, donde corresponde, `updated_at`. No se repiten abajo.

Los montos van en centavos (`bigint`, modo `number` en Drizzle; alcanza para ARS). La moneda es `text default 'ARS'`.

Convención: 🔒 = la tabla tiene `tenant_id` y se consulta solo vía `tenant-scope`.

## Diagrama

```
tenants ─┬─< tenant_domains
         ├─< tenant_memberships >── users ──< accounts / sessions (Auth.js)
         ├─< companies ──────────────┘ (membership.company_id)
         ├─< categories
         ├─< tenant_courses >── courses ─┬─< course_modules ─< lessons
         │                                └─< assessments
         ├─< enrollments ─┬─< lesson_progress
         │                ├─< assessment_attempts
         │                └── certificates
         ├─< orders ─┬─< order_items
         │           ├─< payments
         │           └─< seat_codes
         ├─< payment_accounts
         ├─< payment_events
         ├─< settlements
         ├─< waitlist_entries
         └─< audit_log
```

## Tenants y dominios

### `tenants`
| Columna | Tipo | Notas |
|---|---|---|
| slug | text unique | `civa`, `ribera` |
| name | text | "Cámara Industrial Valle Azul" |
| short_name | text | "CIVA" |
| campus_name | text | Nombre visible de la plataforma: "Campus CIVA" |
| status | enum `tenant_status` (`active`, `suspended`) | |
| is_demo | boolean default false | habilita `/demo` y el pago simulado |
| contact_email | text | reply-to de los emails |
| website_url | text null | sitio institucional de la cámara |
| logo_url, logo_on_dark_url, favicon_url | text null | Vercel Blob |
| theme | jsonb | `{ primary, primaryForeground, accent, accentForeground, radius }` (ver 08) |
| home_content | jsonb | `{ heroTitle, heroSubtitle, heroCtaLabel, aboutText, companiesCtaText }` |
| certificate_config | jsonb | `{ signatories: [{ name, role, signatureUrl }], footerText, showDni }` |
| member_validation_mode | enum (`open`, `cuit`, `cuit_email_domain`, `manual`) | |
| collection_mode | enum (`tenant_account`, `platform_account`) | |
| platform_fee_bps | integer default 0 | 5000 = 50% |
| payment_methods | text[] | subset de `mercadopago`, `manual`, `mock` (`mock` solo si `is_demo`) |
| manual_payment_instructions | text null | CBU/alias, titular, CUIT, a dónde mandar el comprobante |
| manual_payment_expiry_days | integer default 7 | |
| seat_pack_max | integer default 200 | |
| legal_privacy_md, legal_terms_md | text null | si es null se usa la plantilla por defecto |

### `tenant_domains`
| hostname | text unique (lowercase, sin puerto en prod) |
|---|---|
| tenant_id | fk |
| is_primary | boolean |
| verified_at | timestamptz null |

## Usuarios y pertenencia

### `users` (global)
| Columna | Tipo | Notas |
|---|---|---|
| email | text unique | siempre en minúsculas |
| email_verified | timestamptz null | Auth.js |
| first_name, last_name | text null | se completan en onboarding |
| name | text null | Auth.js; se mantiene como `first_name + ' ' + last_name` |
| dni | text null | opcional, solo dígitos; para el certificado |
| phone | text null | |
| is_superadmin | boolean default false | |
| image | text null | Auth.js |

Tablas de Auth.js según el adapter de Drizzle: `accounts`, `sessions`, `verification_tokens`.

### `tenant_memberships` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, user_id | fk | unique(tenant_id, user_id) |
| role | enum (`student`, `tenant_admin`) | |
| company_id | fk companies null | |
| job_title | text null | |
| member_status | enum (`none`, `pending`, `verified`, `rejected`) | estado del pedido de precio socio |
| member_reviewed_by, member_reviewed_at | | |
| onboarded_at | timestamptz null | null → redirigir a `/bienvenida` |
| accepted_terms_at | timestamptz null | |
| last_seen_at | timestamptz null | para "activos 30 días" |

### `companies` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id | fk | |
| cuit | text | 11 dígitos sin guiones; unique(tenant_id, cuit) |
| legal_name | text | |
| trade_name | text null | |
| is_member | boolean | socio activo de la cámara |
| member_since | date null | |
| email_domains | text[] default '{}' | `['talleresbrisco.com.ar']` |
| source | enum (`roster`, `self_declared`, `admin`) | `self_declared` = la creó un alumno con un CUIT fuera del padrón |
| notes | text null | |

## Catálogo y contenido

### `categories` 🔒
`tenant_id`, `slug` (unique por tenant), `name`, `description`, `icon` (nombre de lucide), `sort_order`.

### `courses` (global: biblioteca)
| Columna | Tipo | Notas |
|---|---|---|
| slug | text unique | igual al nombre de la carpeta |
| owner_tenant_id | fk null | null = curso de biblioteca de Pinaro; con valor = curso propio de una cámara (solo se puede asignar a esa cámara) |
| title, subtitle, description | text | desde `course.json` |
| level | enum (`inicial`, `intermedio`, `avanzado`) | |
| duration_minutes | integer | |
| certificate_hours | numeric(5,1) | |
| cover_url | text null | |
| status | enum (`draft`, `coming_soon`, `published`, `archived`) | |
| content_hash | text | sha256 del contenido de la carpeta |
| schema_version | integer | |
| meta | jsonb | outcomes, audiencia, docentes, requisitos, tags |
| synced_at | timestamptz | |

### `course_modules`
`course_id`, `key` (unique por curso), `title`, `summary`, `sort_order`, `archived_at`.

### `lessons`
| Columna | Tipo | Notas |
|---|---|---|
| course_id, module_id | fk | |
| key | text | unique(course_id, key) — **estable** |
| title | text | |
| type | enum (`text`, `video`, `resource`, `quiz`, `exam`) | |
| duration_minutes | integer | |
| is_required | boolean | los `quiz` por defecto `false` |
| sort_order | integer | orden global dentro del curso |
| content_ref | text null | ruta relativa del MDX |
| assessment_id | fk null | para `quiz` y `exam` |
| meta | jsonb | video (provider, url), recursos (archivos) |
| archived_at | timestamptz null | |

### `assessments`
| Columna | Tipo | Notas |
|---|---|---|
| course_id | fk | |
| key | text | unique(course_id, key) |
| kind | enum (`quiz`, `exam`) | |
| title | text | |
| passing_score | integer null | 0–100; null en quizzes de práctica |
| max_attempts | integer null | null = ilimitados |
| cooldown_minutes | integer default 0 | espera entre intentos |
| time_limit_minutes | integer null | |
| draw_count | integer null | null = todas las preguntas |
| shuffle_questions, shuffle_options | boolean | |
| questions | jsonb | banco completo **con respuestas** — solo se lee en el servidor |

### `tenant_courses` 🔒 (qué cursos ofrece cada cámara y a qué precio)
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, course_id | fk | unique(tenant_id, course_id) |
| category_id | fk null | |
| visibility | enum (`public`, `members_only`, `hidden`) | `members_only`: visible para todos, solo socios verificados pueden comprar |
| price_member_cents, price_non_member_cents | bigint | |
| is_featured | boolean | |
| sort_order | integer | |
| enrollment_open | boolean default true | |
| access_days | integer null | días de acceso desde la inscripción; null = sin vencimiento |
| published_at | timestamptz null | |

## Cursada

### `enrollments` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, user_id, course_id, tenant_course_id | fk | unique(tenant_id, user_id, course_id) |
| source | enum (`purchase`, `seat_code`, `admin`, `free`) | |
| order_id, seat_code_id | fk null | |
| status | enum (`active`, `completed`, `expired`, `revoked`) | |
| progress_pct | integer default 0 | desnormalizado, se recalcula al completar lecciones |
| last_lesson_id | fk null | para "Continuar" |
| enrolled_at, completed_at, expires_at | timestamptz | |

### `lesson_progress`
`enrollment_id`, `lesson_id`, `status` (`started`, `completed`), `completed_at`, `last_viewed_at`, `meta jsonb` (p. ej. segundos de video). Unique(enrollment_id, lesson_id).

### `assessment_attempts`
| Columna | Tipo | Notas |
|---|---|---|
| enrollment_id, assessment_id | fk | |
| attempt_number | integer | |
| question_ids | jsonb | preguntas sorteadas, en el orden mostrado |
| option_orders | jsonb | orden de opciones mostrado por pregunta |
| answers | jsonb null | `{ [questionId]: string[] }` |
| score | integer null | 0–100 |
| passed | boolean null | |
| started_at, submitted_at, expires_at | timestamptz | `expires_at` si hay límite de tiempo |

### `certificates` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, enrollment_id (unique), user_id, course_id | fk | |
| code | text unique | `PC-XXXX-XXXX` |
| holder_name, holder_dni | text | snapshot |
| course_title | text | snapshot |
| hours | numeric(5,1) | snapshot |
| score | integer | nota del examen final |
| issued_at | timestamptz | |
| revoked_at, revoked_reason | | |
| pdf_url | text null | cache en Blob; se regenera si es null |
| snapshot | jsonb | nombre de la cámara, firmantes, logo, texto de pie |

## Comercial

### `orders` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, buyer_user_id | fk | |
| company_id | fk null | obligatoria en `seat_pack` |
| number | text | legible, secuencial por tenant: `CIVA-000123` |
| type | enum (`individual`, `seat_pack`) | |
| status | enum (`pending`, `awaiting_payment`, `paid`, `failed`, `cancelled`, `expired`, `refunded`) | |
| pricing_tier | enum (`member`, `non_member`) | |
| currency | text | |
| subtotal_cents, total_cents | bigint | |
| platform_fee_cents | bigint | calculado con `platform_fee_bps` al crear |
| collection_mode | enum | snapshot del modo del tenant al crear |
| payment_provider | text null | proveedor elegido |
| expires_at, paid_at | timestamptz null | |
| fulfilled_at | timestamptz null | inscripción o códigos generados (idempotencia) |
| notes | text null | |

### `order_items`
`order_id`, `tenant_course_id`, `course_id`, `quantity`, `unit_price_cents`, `total_cents`. En v1 cada orden tiene un solo ítem, pero la tabla permite carrito a futuro.

### `payments` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, order_id | fk | |
| provider | enum (`mock`, `manual`, `mercadopago`) | |
| external_id | text null | id del pago en el proveedor; unique(provider, external_id) |
| external_reference | text | = `order.id`, se manda al proveedor |
| preference_id | text null | MP |
| status | enum (`created`, `pending`, `in_process`, `approved`, `rejected`, `cancelled`, `refunded`) | |
| amount_cents, fee_cents | bigint | |
| checkout_url | text null | |
| marked_by_user_id | fk null | pagos manuales |
| manual_reference | text null | nro. de operación de la transferencia |
| raw | jsonb | última respuesta del proveedor |

### `payment_accounts` 🔒 (cuenta de MP conectada por cada cámara)
`tenant_id` (unique por provider), `provider`, `external_user_id`, `access_token_enc`, `refresh_token_enc`, `public_key`, `token_expires_at`, `live_mode`, `status` (`connected`, `expired`, `revoked`), `connected_by_user_id`, `connected_at`.

### `payment_events` (log crudo de webhooks)
`tenant_id` null, `provider`, `topic`, `external_id`, `payload jsonb`, `headers jsonb`, `signature_valid boolean`, `processed_at`, `error text`, `received_at`.

### `seat_codes` 🔒
| Columna | Tipo | Notas |
|---|---|---|
| tenant_id, course_id, tenant_course_id | fk | |
| order_id | fk null | null = creado por admin sin orden |
| company_id | fk null | la empresa compradora; se asigna al canjeador si no tiene empresa |
| code | text unique | `XXXX-XXXX`, alfabeto sin 0/O/1/I/L |
| status | enum (`available`, `sent`, `redeemed`, `revoked`) | |
| sent_to_email | text null | |
| sent_at | timestamptz null | |
| redeemed_by_user_id, redeemed_at | null | |
| expires_at | timestamptz null | |
| created_by_user_id | fk | |

### `settlements` 🔒 (solo `platform_account`)
`tenant_id`, `period_start`, `period_end`, `gross_cents`, `fee_cents`, `net_cents`, `orders_count`, `status` (`draft`, `paid`), `paid_at`, `payment_reference`, `notes`. Unique(tenant_id, period_start, period_end).

## Otros

### `waitlist_entries` 🔒
`tenant_id`, `course_id`, `email`, `user_id` null, `company_name` null, `notified_at` null. Unique(tenant_id, course_id, email).

### `audit_log` 🔒
`tenant_id` null (null = acción global de superadmin), `actor_user_id`, `action` (`order.mark_paid`, `certificate.revoke`, `tenant_course.update_price`, `payment_account.connect`, `member.approve`, ...), `entity_type`, `entity_id`, `data jsonb` (antes/después), `ip`, `user_agent`.

### `rate_limits`
`key` (p. ej. `magic:email:x@y.com`), `window_start`, `count`. Unique(key, window_start).

## Índices mínimos

- Todas las fk.
- `tenant_domains(hostname)`.
- `enrollments(tenant_id, user_id)`, `enrollments(tenant_id, course_id, status)`.
- `orders(tenant_id, status, created_at desc)`, `orders(tenant_id, buyer_user_id)`.
- `payments(order_id)`, `payments(provider, external_id)`.
- `seat_codes(code)`, `seat_codes(order_id)`.
- `certificates(code)`.
- `companies(tenant_id, cuit)`.
- `tenant_memberships(tenant_id, company_id)`.

## Reglas de integridad que van en código (con tests)

- Una orden pasa a `paid` una sola vez; `fulfilled_at` se setea en la misma transacción que crea la inscripción o los códigos.
- Un `seat_code` se canjea una sola vez (`update ... where status in ('available','sent') returning`).
- Canjear un código de un curso en el que el usuario ya está inscripto → error "Ya estás inscripto en este curso"; el código **no** se consume.
- Un certificado por inscripción (unique en `enrollment_id`).
- `progress_pct` = lecciones obligatorias completadas / lecciones obligatorias no archivadas.
