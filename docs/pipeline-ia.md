# Pipeline de IA: “Optimizar con IA”, Ángulos y la página del producto

Sistema de agentes creativos, adaptado a LATAM con pago contra entrega. Hoy genera la **ficha de producto** y el **cliente ideal** (Información base), en la etapa **Ángulos** el ranking del orquestador y los **2 desarrollos de ángulo** elegidos, y en la etapa **Textos** (“Página del producto”) los bloques de la página en la tienda. Los estáticos, los guiones y el copywriter de anuncios vienen después y leen estas piezas.

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
 Página del producto (ver abajo): redactor de página → content_items, bloque a bloque
                 │
                 ▼
 Siguiente: imágenes · guionista-ugc ∥ generador-estaticos → productor-clips → copywriter
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

## Página del producto (etapa Textos)

Spec: `docs/spec-textos.md`. Diseño: `design-system/textos.md` (PantallasTextos1/2 y PantallasTextosEscritorio). La clave interna sigue siendo `textos` y la URL `/products/[id]/copy`; el comerciante la ve como **Página del producto** (`COPY_STAGE_TITLE`), para no confundirla con el texto del anuncio, que escribe el copywriter en Anuncios.

```
Los 2 desarrollos aprobados + ficha + cliente ideal + precio (y etiquetas aprobadas) + envío de la tienda
                 │
      “Escribir textos con IA” (o “Continuar” en Ángulos)  POST /api/products/[id]/copy
                 ▼   (copy_runs: queued → running, after())
 redactor de página (effort medium) → bloques con clave de enum + preguntas frecuentes
                 │
 copyProblems (lib/copy/schemas.ts): cantidades, largos, montos, garantía, promesas prohibidas
                 │   si falla: se pide otra vez diciendo qué falló; si vuelve a fallar, error
                 ▼
 content_items (generated) → aceptar · editar · descartar, uno a la vez, con Deshacer
                 ▼
 Obligatorios aprobados (o con el original de Shopify) → habilita Imágenes
```

| Tabla | Qué guarda |
|---|---|
| `copy_runs` | Una escritura: `status`, `input` (mercado, precio, etiquetas, `avatar_id`, los 2 desarrollos usados con su `edited_at`, `free_shipping`, `redo`), `payload` (lo que devolvió el modelo). Una activa por producto |
| `content_items` | Un bloque: `key` (`lib/copy/blocks.ts`), `position` (orden de la página), `original` (título de Shopify; en «Cómo funciona», la descripción como referencia), `proposal`, `edited_text`, `angle_role`, `note`, `missing`, `status`. Reescribir deja `superseded_at` en lo que no estaba aprobado |
| `merchant_settings.free_shipping` | Cómo despacha la tienda (hoy: envío gratis a todo el país, siempre con pago contra entrega) |

**Bloques** (`lib/copy/blocks.ts`, el mismo límite para el prompt, la validación y el contador de la pantalla): título (70), nombre corto (30), descripción corta (160), frase de la oferta (90), 3 a 5 beneficios (110), cómo funciona (40 a 120 palabras), 3 a 6 preguntas (pregunta 90, respuesta 280), envío y pago (280), garantía (160, solo con `guarantee_days`), título y descripción para Google (60 y 155). Obligatorios: título, nombre corto, descripción corta, oferta, cómo funciona, envío y pago y los dos de Google.

**Reglas:**

- La IA escribe texto plano; el HTML de la descripción de Shopify lo arma una plantilla al publicar.
- Beneficios: cada uno trae su razón de compra (`kind`: `result`, `ease`, `difference`, `comfort`, `value`, `safety`, `fit`), distinta en cada uno y siempre con un `result`; si no hay tantas razones, escribe menos. Cada dato va en un solo bloque («Cómo funciona» explica, los beneficios dicen qué gana el comprador). Nada de palabras internas («la ficha», «ángulo principal») en la tienda.
- Montos: solo los de PRECIO Y OFERTA (precio, tachado y su ahorro, packs, precio por unidad y ahorro), revisados en código.
- Pago contra entrega siempre (oferta, envío y pago, y al menos una pregunta). Garantía solo con días en la ficha; si no, la pantalla la muestra como «No se incluye».
- Plazo de entrega y WhatsApp no se conocen: el bloque sale sin ellos y con `missing`, y la pantalla pide completarlos al editar.
- Descartar: con original, se mantiene lo de Shopify; sin original, el bloque no va (y si es obligatorio queda «Falta aprobar»).
- «Rehacer descartados» / «Reescribir» (`{ redo: true }`) reescribe lo no aprobado y le pasa al modelo lo aprobado (no se toca) y lo descartado (no se repite).
- Si se reabre, regenera o edita un desarrollo después de escribir, la etapa avisa «Cambiaste tus ángulos».

**Rutas**

| Método y ruta | Qué hace |
|---|---|
| `GET /api/products/[id]/copy` | Estado de la etapa (sondeo cada 2,5 s mientras escribe) |
| `POST /api/products/[id]/copy` | `{ redo?: boolean }`: escribe, o reescribe lo no aprobado |
| `PATCH /api/products/[id]/copy/items/[itemId]` | `{ action: "approve" \| "reject" \| "reopen", text? }` |

Tope: 20 escrituras por comerciante cada 24 horas. `/dev/screens/copy?state=locked|start|writing|failed|fresh|review|stale|done|complete` muestra la etapa con datos de ejemplo.

## Pendiente

- **Siguiente iteración:** Imágenes; después, estáticos, guiones y el copywriter de anuncios (`agentes-creativos 4/copywriter.md`, con cierre COD).
- **Datos de la tienda:** plazo real de entrega, WhatsApp y garantía de la tienda (la página y el copywriter los necesitan); hoy solo se guarda `free_shipping`, sin pantalla para cambiarlo.
- **Publicar la página:** plantilla HTML con los bloques aprobados y `productUpdate` (título, descripción, SEO) en la etapa Publicar.
- **Imágenes generadas:** `getProductImages` devuelve vacío.
- **Precio:** `getPricing` todavía usa envío y publicidad fijos. Hay que usar los números del onboarding y la moneda del mercado.
- **Evaluaciones:** medir con casos reales si el cliente ideal mejora los anuncios (ver el análisis de dropflex base).
