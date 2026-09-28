# 04 — Pagos

## Objetivos

1. La lógica de órdenes, inscripciones y códigos **no sabe** qué proveedor de pago se usa.
2. Arrancar con tres proveedores: **mock** (demo), **manual** (transferencia) y **Mercado Pago**.
3. Soportar que cobre la cámara con su cuenta (con o sin comisión automática para Pinaro) o que cobre Pinaro y liquide.
4. Poder sumar otro proveedor (por ejemplo, Stripe o un gateway bancario) implementando una sola interfaz.

> ⚠️ Antes de implementar Mercado Pago, verificar contra la documentación oficial vigente: Checkout Pro (preferencias), OAuth para marketplace, el parámetro `marketplace_fee`, notificaciones (webhooks) y la validación de la firma `x-signature`. Si algo de este documento no coincide con la documentación, avisar antes de implementar.

## Interfaz

```ts
// src/lib/payments/types.ts
export type ProviderId = 'mock' | 'manual' | 'mercadopago'

export interface CheckoutInput {
  tenant: Tenant
  order: Order                  // incluye total_cents, platform_fee_cents, collection_mode
  items: OrderItemWithCourse[]
  buyer: { email: string; firstName?: string; lastName?: string }
  urls: { success: string; failure: string; pending: string; notification: string }
}

export interface CheckoutResult {
  payment: { externalId?: string; preferenceId?: string; status: PaymentStatus }
  next:
    | { kind: 'redirect'; url: string }             // MP, mock
    | { kind: 'instructions'; markdown: string }     // manual
}

export interface NormalizedPayment {
  externalId: string
  externalReference: string    // order.id
  status: PaymentStatus        // approved | pending | in_process | rejected | cancelled | refunded
  amountCents: number
  feeCents: number
  raw: unknown
}

export interface PaymentProvider {
  id: ProviderId
  isAvailable(tenant: Tenant): Promise<boolean>        // p. ej. MP requiere cuenta conectada (o platform_account)
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>
  // Webhooks: verifica la firma y devuelve los ids a consultar. NO confía en el payload.
  parseWebhook?(req: Request): Promise<{ valid: boolean; tenantId?: string; externalIds: string[] }>
  fetchPayment?(tenant: Tenant, externalId: string): Promise<NormalizedPayment>
}
```

`src/lib/payments/registry.ts` devuelve el proveedor por id. `src/lib/payments/service.ts` concentra la lógica común:

```ts
createOrder(tenant, user, { tenantCourseId, type, quantity, companyCuit? })  // calcula precio con pricing.ts
startCheckout(tenant, orderId, providerId)
applyPaymentUpdate(tenant, normalized)       // actualiza payment y orden; si approved → fulfillOrder
fulfillOrder(tenant, orderId)                // idempotente: inscripción (individual) o códigos (seat_pack) + emails
markManualPaymentAsPaid(tenant, orderId, adminUserId, reference)
```

## Máquina de estados de la orden

```
pending ──(elige transferencia)──> awaiting_payment ──(admin marca pagada)──> paid
   │                                      │
   ├──(pago aprobado)──────────────────────────────────────────────────────> paid
   ├──(pago rechazado)──> failed (puede reintentar → vuelve a pending con un nuevo payment)
   ├──(usuario cancela)──> cancelled
   └──(vence)──> expired
paid ──(reembolso, v2)──> refunded
```

- `paid` solo se alcanza desde `applyPaymentUpdate` (con estado **consultado al proveedor**) o desde `markManualPaymentAsPaid` (admin, con `audit_log`).
- `fulfillOrder` corre en la misma transacción que el paso a `paid`, y usa `fulfilled_at` para no repetir.
- Órdenes de total 0 → `paid` y `fulfilled` directo, sin proveedor.

## Cálculo de montos

```ts
// src/lib/pricing.ts
getUnitPrice(tenantCourse, tier: 'member' | 'non_member'): number
resolveTier(tenant, membership, company?): 'member' | 'non_member'
platformFee(totalCents, bps) = Math.round(totalCents * bps / 10000)
```

- `individual`: tier según la membership del alumno (`member_status = verified` y `company.is_member`).
- `seat_pack`: tier según la empresa del CUIT indicado; en modos `cuit_email_domain` y `manual`, además el comprador tiene que ser socio verificado de esa empresa.
- `visibility = members_only` y tier `non_member` → no se puede comprar (la UI explica cómo validar la condición de socio).
- Tests unitarios para todas las combinaciones de modo de validación × visibilidad × tipo de orden.

## Proveedor `mock` (demo)

- Solo disponible si `tenant.is_demo` y `DEMO_MODE=true`.
- `createCheckout` crea el payment y redirige a `/checkout/simulado/<paymentId>`: una pantalla que imita un checkout ("Esto es un pago simulado para la demo"), con el monto, y tres botones: **Aprobar**, **Rechazar**, **Dejar pendiente**.
- Al elegir, llama a `applyPaymentUpdate` con el estado elegido y redirige a `/checkout/<orderId>/resultado`.
- Sirve para mostrar el flujo completo en una reunión sin tarjetas de prueba.

## Proveedor `manual` (transferencia)

- `createCheckout` → orden `awaiting_payment`, `expires_at = now + manual_payment_expiry_days`, y devuelve `instructions` con `tenant.manual_payment_instructions` + el número de orden como referencia.
- Pantalla de resultado: instrucciones, botón "Copiar datos", aviso de que la inscripción se activa cuando la cámara confirme el pago. Email con lo mismo.
- En `/admin/ordenes`, filtro "Transferencias pendientes" con acción **Marcar como pagada** (pide nro. de operación opcional) y **Cancelar**.

## Proveedor `mercadopago`

### Dos modos según `tenant.collection_mode`

| | `tenant_account` | `platform_account` |
|---|---|---|
| Access token usado | El de la cámara, obtenido por OAuth (`payment_accounts`) | `MP_PLATFORM_ACCESS_TOKEN` (cuenta de Pinaro) |
| Dónde cae la plata | Cuenta de MP de la cámara | Cuenta de MP de Pinaro |
| Comisión de Pinaro | `marketplace_fee` en la preferencia (monto en pesos = `platform_fee_cents / 100`); si `platform_fee_bps = 0`, no se envía | Se queda en la cuenta de Pinaro; el neto se liquida con `settlements` |
| Requisito | La cámara conectó su cuenta | Ninguno |

### Conexión de la cuenta de la cámara (OAuth marketplace)

1. En `/admin/configuracion/cobros`, el admin de la cámara hace clic en **Conectar Mercado Pago**.
2. `GET /api/mp/oauth/start` → genera un `state` firmado (tenantId + userId + nonce + vencimiento de 10 min) y redirige a la URL de autorización de MP con `client_id`, `redirect_uri` y `state`. **Verificar en la documentación vigente si corresponde PKCE.**
3. MP vuelve a `GET /api/mp/oauth/callback?code&state` (la `redirect_uri` registrada en la app de MP de Pinaro es fija: `https://plataforma.pinaro.ar/api/mp/oauth/callback`; el callback lee el tenant del `state`, no del host, y al final redirige al dominio primario de la cámara).
4. Se intercambia el `code` por `access_token`, `refresh_token`, `user_id`, `public_key` y vencimiento. Se guardan encriptados en `payment_accounts`. Se registra en `audit_log`.
5. El panel muestra "Conectado como <nickname/email de MP>" y el botón "Desconectar".
6. El cron `refresh-mp-tokens` renueva con `refresh_token` antes del vencimiento. Si falla, `status = expired`, se deshabilita MP como medio de pago de esa cámara y se avisa por email al admin.

### Checkout

1. `createCheckout` crea una preferencia de Checkout Pro con:
   - `items`: un ítem por `order_item` (título del curso, cantidad, precio unitario en pesos, `currency_id: 'ARS'`).
   - `payer.email`.
   - `external_reference`: `order.id`.
   - `back_urls` (success/failure/pending) → `https://<dominio-primario>/checkout/<orderId>/resultado` y `auto_return: 'approved'`.
   - `notification_url`: `https://plataforma.pinaro.ar/api/webhooks/mercadopago?t=<tenantId>`.
   - `marketplace_fee` (solo `tenant_account` con comisión).
   - `statement_descriptor`: `short_name` de la cámara.
   - `expiration_date_to`: el `expires_at` de la orden.
2. Guarda `preference_id` y `checkout_url` (usar `init_point`, o `sandbox_init_point` si `MP_SANDBOX`).
3. Redirige al checkout de MP.

### Webhook (`POST /api/webhooks/mercadopago`)

1. Guardar el evento crudo en `payment_events` (siempre, antes de cualquier validación).
2. Validar la firma `x-signature` con `MP_WEBHOOK_SECRET` según el esquema documentado por MP (manifest con `data.id`, `x-request-id` y `ts`). Si no valida → 401 y `signature_valid = false`.
3. Solo procesar el tópico de pagos. Tomar el `data.id`.
4. Resolver el tenant con el parámetro `t` y **consultar el pago a la API de MP** con el access token que corresponde a ese tenant (el de la cámara o el de Pinaro).
5. Verificar que `external_reference` sea una orden de ese tenant y que el monto coincida con `total_cents`. Si no coincide → marcar error y no acreditar.
6. `applyPaymentUpdate` (idempotente por `(provider, external_id)`).
7. Responder 200 rápido. Si algo falla después de guardar el evento, responder 500 para que MP reintente.

### Pantalla de resultado

`/checkout/<orderId>/resultado` **no confía en los query params** de MP: muestra el estado de la orden en la base. Si sigue `pending`, hace polling cada 3 s durante 60 s (o consulta el pago a MP con el `payment_id` del query param, de forma idempotente) y después muestra "Estamos confirmando tu pago, te avisamos por email".

## Liquidaciones (`platform_account`)

- `/superadmin/liquidaciones`: elegir cámara y período → se calculan las órdenes `paid` del período: bruto, comisión (`platform_fee_cents`) y neto → "Generar liquidación" crea un `settlement` en `draft`.
- "Marcar como pagada" con referencia de transferencia → `paid`.
- La cámara ve sus liquidaciones en `/admin/cobros/liquidaciones` (solo lectura) y puede exportarlas a CSV con el detalle de órdenes.

## Reembolsos

Fuera de alcance en v1. El admin puede **cancelar** una inscripción (`revoked`) y registrar una nota. La devolución de dinero se hace desde el panel del proveedor. Dejar el estado `refunded` y el método opcional `refund?()` en la interfaz para v2.

## Tests obligatorios

- `applyPaymentUpdate` con el mismo pago aprobado dos veces → una sola inscripción.
- Webhook con firma inválida → 401, nada cambia.
- Webhook de un pago cuyo `external_reference` es de otro tenant → rechazado.
- Monto que no coincide → no acredita.
- Seat pack de 10 aprobado → exactamente 10 códigos.
- Orden de total 0 → inscripción sin pasar por proveedor.
- Transferencia marcada como pagada por un usuario que no es admin → 403.
