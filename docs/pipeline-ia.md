# Pipeline de IA: “Optimizar con IA”

Primera iteración del sistema de agentes creativos, adaptado a LATAM con pago contra entrega. Hoy genera la **ficha de producto** y el **cliente ideal**. Los ángulos de venta, los guiones y los estáticos vienen después y leen estas dos piezas.

```
Shopify ──► products (descripción + imágenes)       merchant_settings (país, moneda, idioma)
                 │                                          │
Información base: el comerciante agrega lo que sabe,        │
excluye imágenes que no sirven y sube otras                 │
                 │                                          │
      “Optimizar con IA”  POST /api/products/[id]/optimize ◄┘
                 │  (pipeline_runs: queued → running, en segundo plano con after())
                 ▼
 1. product_brief    Claude + visión sobre las imágenes en uso → product_briefs
 2. customer_avatar  Claude a partir de la ficha              → customer_avatars (generated)
                 │
                 ▼
 El comerciante acepta, edita o vuelve a generar (approved / in_review)
                 │
                 ▼
 Siguiente iteración: angle-router → agentes de ángulo → guionista-ugc ∥ generador-estaticos → productor-clips
```

## Modelo de datos (en inglés)

| Tabla | Qué guarda |
|---|---|
| `merchant_settings` | Mercado confirmado: `country_code`, `currency`, `language`, `timezone`, `market_confirmed_at` |
| `shopify_connections.country_code` / `timezone` | Lo que Shopify dice de la tienda (sugerencia) |
| `products` | Espejo del producto de Shopify + `base_info` (lo que el comerciante sabe) |
| `product_reference_images` | Imágenes de referencia: `source` (`shopify`, `upload`, `url`), `excluded`, `is_cover`, `url` o `storage_path` |
| `pipeline_runs` | Cada optimización: `status`, `current_step`, `error_message` (en español), `input` (mercado e imágenes usadas). Una activa por producto |
| `product_briefs` | La ficha (`payload`, esquema `productBriefSchema`) |
| `customer_avatars` | El cliente ideal (`payload`, esquema `customerAvatarSchema`) con su `status` (`content_status`) |
| `ai_generations` | Cada llamada al modelo: tokens, costo en USD, latencia, error |

Enum `content_status`: `generated`, `in_review`, `approved`, `rejected`, `publishing`, `published`, `error`. La UI lo muestra con `StatusBadge` en español (`toUiStatus`).

## Esquemas

**Ficha de producto** (`lib/ai/schemas.ts › productBriefSchema`): la entrada estándar de los agentes (`agentes-creativos/README.md`), con tres cambios:

- precio y costo en la moneda del mercado (no USD);
- `images[]`: qué muestra cada imagen y si sirve para anuncios;
- `inferred_fields` y `missing_inputs` (preguntas en tuteo para el comerciante). Las reseñas, expertos y cifras solo cuentan si el comerciante los escribió.

**Cliente ideal** (`customerAvatarSchema`): las 7 secciones y la fórmula del avatar de dropflex base (`docs/prompt-avatar.md` del proyecto base), más lo que le faltaba para elegir ángulos:

- demografía;
- nivel de consciencia (Schwartz) y sofisticación con su razón;
- momentos detonantes (el filtro del gancho);
- dudas del pago contra entrega;
- frases con sus palabras (`voice_of_customer`).

La plantilla de la fórmula va en el prompt: en el proyecto base solo se nombraba.

## Decisiones

- **Modelo:** `claude-opus-5` con pensamiento adaptativo.
  - Esfuerzo: `medium` para la ficha (extraer y ordenar) y `high` para el cliente ideal (criterio de estratega).
  - `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): si el modelo declina por política, la API reintenta dentro de la misma llamada.
- **Caché:** el system prompt depende solo del mercado; el producto va en el mensaje del usuario.
- **Costos:** cada llamada queda en `ai_generations`. Hay un tope de 30 optimizaciones por comerciante cada 24 horas (`DAILY_RUN_LIMIT`).
- **Corridas colgadas:** si el proceso muere, una corrida `running` de más de 10 minutos (o `queued` de más de 3) pasa a `failed` al leerse, con “Toca Reintentar”.
- **Imágenes subidas:** el navegador sube directo a Storage con una URL firmada, porque Vercel no acepta cuerpos de 10 MB. Después, la app confirma revisando el tipo real por sus primeros bytes.
- **Imágenes por enlace:** el servidor las descarga con reglas contra SSRF:
  - solo http(s) hacia IPs públicas;
  - redirecciones revisadas;
  - tope de 10 MB leyendo por partes.
- **Temas encontrados** (`ProductInfoInput`): se detectan con reglas (`lib/products/topics.ts`), sin llamar al modelo, para responder en cada autoguardado.

## Rutas

| Método y ruta | Qué hace |
|---|---|
| `PATCH /api/products/[id]/base-info` | Autoguarda el texto; devuelve `savedAt` y los temas (también `POST`, para `sendBeacon`) |
| `POST /api/products/[id]/images/upload-url` | Valida tipo, tamaño y tope; devuelve una URL firmada de subida |
| `POST /api/products/[id]/images` | Confirma la subida y la registra |
| `POST /api/products/[id]/images/url` | Trae una imagen desde un enlace |
| `PATCH /api/products/[id]/images/[imageId]` | `{ excluded }` |
| `POST /api/products/[id]/optimize` | Empieza la optimización (o devuelve la activa) |
| `GET /api/products/[id]/optimize` | Estado de la corrida y propuesta vigente (sondeo cada 2,5 s) |
| `PATCH /api/products/[id]/avatar` | `{ action: "approve" \| "reopen" }` |
| `PUT /api/products/[id]/avatar` | Guarda lo editado; con `approve: true` lo aprueba |
| `POST /api/onboarding/market` | Confirma país, moneda e idioma |

## Poner en marcha

1. Aplica `supabase/migrations/20260924000000_products_and_optimization.sql`. Crea el bucket privado `product-references`.
2. Agrega `ANTHROPIC_API_KEY` a `.env.local` y a Vercel. Usa una key creada dentro de un workspace (Console → Workspaces → API keys). Si la key es de la organización, agrega también `ANTHROPIC_WORKSPACE_ID` con el id del workspace; sin él la API responde 400 “This API key is not scoped to a workspace”.
3. Los productos elegidos en el onboarding se crean al guardar “Tus números”. Para cuentas anteriores, se crean al abrir Productos.
4. `/dev/screens/base?state=new|optimizing|failed|review|approved` muestra la pantalla con datos de ejemplo (solo en desarrollo).

## Pendiente

- **Siguiente iteración:** `angle-router` y los agentes de ángulo, con la ficha y el cliente ideal como entrada.
  - Adaptarlos a LATAM y a pago contra entrega.
  - La puntuación se calcula en código, no en el prompt.
- **Textos e imágenes generados:** `getProductContent` y `getProductImages` devuelven vacío.
- **Precio:** `getPricing` todavía usa envío y publicidad fijos. Hay que usar los números del onboarding y la moneda del mercado.
- **Evaluaciones:** medir con casos reales si el cliente ideal mejora los anuncios (ver el análisis de dropflex base).
