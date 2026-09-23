# Pipeline de IA: “Optimizar con IA” y Ángulos

Sistema de agentes creativos, adaptado a LATAM con pago contra entrega. Hoy genera la **ficha de producto** y el **cliente ideal** (Información base) y, en la etapa **Ángulos**, el ranking del orquestador y los **2 desarrollos de ángulo** elegidos. Los textos, los estáticos, los guiones y el copywriter vienen después y leen estas piezas.

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
 Etapa Ángulos (ver abajo): angle-router → angulo-<principal> ∥ angulo-<secundario>
                 │
                 ▼
 Siguiente: textos · guionista-ugc ∥ generador-estaticos → productor-clips → copywriter
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

## Etapa Ángulos

```
Cliente ideal aprobado + ficha + precio (y etiquetas de packs aprobadas)
                 │
      “Elegir ángulos con IA”  POST /api/products/[id]/angles   (angle_rankings: queued → running)
                 ▼
 angle-router (effort medium) → criterios 0–5 y penalización por ángulo, combinaciones, datos que faltan
                 │
 lib/angles/score.ts → puntaje 0–100 por ángulo, ranking y sugerencia (principal + secundario)
                 ▼
 El comerciante confirma o cambia   PUT /api/products/[id]/angles/selection
                 ▼
 angulo-<principal> ∥ angulo-<secundario> (effort high) → angle_briefs.payload (generated)
                 ▼
 Aprobar, editar o regenerar cada uno; con los 2 aprobados se habilita Textos
```

| Tabla | Qué guarda |
|---|---|
| `angle_rankings` | Una evaluación: `status`, `input` (mercado, precio, `avatar_id` y el puntaje posible con la prueba que falta), `payload` (lo que dijo el modelo), `scores` (el ranking calculado), `suggested_*`, la elección confirmada (`primary_angle`, `secondary_angle`, `confirmed_at`). Una activa por producto |
| `angle_briefs` | Un desarrollo por intento: `angle`, `role` (`primary`/`secondary`), `generation` (estado de la llamada), `payload` (el brief), `status` (`content_status`). Regenerar crea otro y el anterior queda `rejected`. Uno activo por papel |

**Puntaje** (`lib/angles/score.ts`): `fit = Σ(criterio × peso) / (5 × Σpesos) × 100 − penalización`, con los pesos y castigos de `angle-router.md` (`lib/angles/catalog.ts`). El sistema pisa al modelo con lo que puede comprobar:

- `real_expert` y la penalización de Autoridad salen de `proof.real_expert` de la ficha;
- `narrative_reviews` y la penalización de Historia personal salen de `proof.real_reviews`;
- la sofisticación de Enemigo común sale del cliente ideal;
- la fecha comercial de Oferta sale de `real_deadline_or_event`;
- Oferta se castiga si ningún pack gana más que 1 unidad.

**Esquema compacto y validado:** la API compila el esquema de salida a una gramática y rechaza las demasiado grandes (400 «compiled grammar is too large»). Por eso los 6 ángulos comparten una forma y los criterios van como lista de puntajes en el orden de `lib/angles/catalog.ts`. `routerProblems` revisa que estén los 6, sin repetir, con un puntaje de 0 a 5 por criterio; si no, se pide otra respuesta una vez diciendo qué falló y, si vuelve a fallar, la evaluación queda con error. Nunca se completa con ceros. Un test impide que un esquema de ángulos sea más grande que el del cliente ideal.

Desempates: si los dos primeros están a menos de 5 puntos, gana el que tiene la prueba real hoy; la oferta pasa a secundario si otro está a menos de 10 puntos.

**Prompts** (`lib/angles/prompts.ts`): los de `agentes-creativos/*.md`, adaptados a LATAM:

- copy en el idioma del mercado con tuteo (`marketBlock`), no en inglés;
- el riesgo lo quita el pago contra entrega; la garantía solo si la ficha la trae;
- los umbrales en USD se reemplazan por `pricingBlock` (packs, ganancia, CPA máximo);
- la ley es la del país (`consumerAuthority`), además de las políticas de Meta.

**Rutas**

| Método y ruta | Qué hace |
|---|---|
| `GET /api/products/[id]/angles` | Estado de la etapa (sondeo cada 2,5 s) |
| `POST /api/products/[id]/angles` | Evalúa (o devuelve la evaluación activa) |
| `PUT /api/products/[id]/angles/selection` | `{ primary, secondary }`: confirma y desarrolla los que falten |
| `PATCH /api/products/[id]/angles/briefs/[briefId]` | `{ action: "approve" \| "reopen" }` |
| `PUT /api/products/[id]/angles/briefs/[briefId]` | `{ edit, approve? }`: ganchos, argumento por etapa, objeciones y oferta |
| `POST /api/products/[id]/angles/briefs/[briefId]` | Regenera |

Topes: 20 evaluaciones y 60 desarrollos por comerciante cada 24 horas. `/dev/screens/angles?state=locked|start|evaluating|failed|ranking|developing|review|approved` muestra la etapa con datos de ejemplo.

## Pendiente

- **Siguiente iteración:** Textos (la página del producto) a partir de los 2 desarrollos aprobados; después, estáticos, guiones y el copywriter (`agentes-creativos 4/copywriter.md`, con cierre COD).
- **Datos de la tienda para el cierre COD:** envío gratis, plazo real de entrega, WhatsApp y garantía (el copywriter los necesita).
- **Textos e imágenes generados:** `getProductContent` y `getProductImages` devuelven vacío.
- **Precio:** `getPricing` todavía usa envío y publicidad fijos. Hay que usar los números del onboarding y la moneda del mercado.
- **Evaluaciones:** medir con casos reales si el cliente ideal mejora los anuncios (ver el análisis de dropflex base).
