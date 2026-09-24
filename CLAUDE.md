# DropFlex

Herramienta para comerciantes de dropshipping con pago contra entrega: la IA genera el contenido de cada producto (textos, imágenes, anuncios) y el comerciante decide qué se publica en su tienda y en Meta Ads. Mobile first: el usuario trabaja desde el teléfono, en ratos cortos, y necesita saber en segundos qué le toca decidir.

## Stack

- Next.js 16 (App Router, Turbopack, `cacheComponents: true`, `proxy.ts` en lugar de `middleware.ts`), React 19, TypeScript.
- Tailwind CSS v4 (sin `tailwind.config.*`: los tokens viven en `app/globals.css`) + `tw-animate-css`.
- shadcn/ui (new-york) en `components/ui/`, sobre `radix-ui`, `vaul` (drawer) y `sonner` (toast).
- Supabase Auth con `@supabase/ssr`. Íconos con `lucide-react`. Tema con `next-themes` (`attribute="class"`, `defaultTheme="system"`).
- Fuentes Geist y Geist Mono con `next/font/google` (`--font-geist-sans` / `--font-geist-mono` → `font-sans` / `font-mono`).
- Vercel (`drop-pulse.vercel.app`): las funciones corren en `gru1` (São Paulo, `vercel.json › regions`), junto a Supabase (`sa-east-1`). No cambiar una sin la otra: cada pantalla hace varias idas a la base, y entre regiones cada una cuesta ~120 ms. Se comprueba con el header `x-vercel-id` (`gru1::gru1::…`, no `gru1::iad1::…`).

## Fuente de verdad: `design-system/`

Todo color, medida, radio, tipografía, duración y texto de UI sale de `design-system/`. No inventes valores.

- `README.md`: principios, voz, fundamentos visuales, ciclo de vida, accesibilidad.
- `arquitectura.md`: navegación, rutas y por qué.
- `onboarding.md`: flujo de alta (Shopify obligatorio, Meta Ads opcional), decisiones y estados.
- `tokens.json`: todos los tokens (colores claro/oscuro, tipografía, espaciado, radios, sombras, duraciones, easing, medidas, z-index, breakpoints).
- `export/globals.css`: tokens para Tailwind v4, copiados en `app/globals.css`.
- `reference/index.d.ts`: props de cada componente. `reference/<Componente>/README.md`: comportamiento, estados y textos.
- `reference/bundle.css` + `reference/bundle.js`: implementación de referencia con las medidas exactas y los textos y cifras de las pantallas de ejemplo (`Screen*`).
- `screenshots/`: capturas de referencia generadas desde las previews.

Las medidas de `bundle.css` que no están en `tokens.json` se declaran en el bloque **“Derivados de design-system/reference/bundle.css”** de `app/globals.css` (`text-micro`, `text-tab`, `text-small`, `text-row`, `text-topbar`, `tracking-label`, `rounded-swatch|kbd|segment`, `--stroke-strong`, `scale-press`). Si falta una, agrégala ahí citando la regla de `bundle.css`; nunca uses un valor suelto.

`lib/tokens.ts` lee `design-system/tokens.json` cuando un valor se necesita en TypeScript (por ejemplo, `themeColor`).

## Componentes: `components/df/`

- Un archivo por componente (`components/df/button.tsx`, `status-badge.tsx`…), en TypeScript, con las props de `reference/index.d.ts` y el comportamiento de `reference/<Componente>/README.md`. Se exportan desde `components/df/index.ts`.
- Se apoyan en shadcn (`components/ui/`) cuando encaja, sin duplicar primitivas: `Button`/`IconButton` → `button`, `SegmentedControl` → `toggle-group`, `Field` → `input` + `label`, `Toast` → `sonner`, `AssistantSheet` → `drawer`. `Icon` → `lucide-react` con `strokeWidth={1.75}`.
- Clases Tailwind con tokens: nada de hex, `rgb()` ni `px` arbitrarios en `components/` ni en `app/`. La única excepción es `OfferPreview`, que usa colores fijos de tienda a propósito. La paleta por defecto de Tailwind está desactivada (`--color-*: initial`): solo existen los colores de DropFlex.
- Por defecto, Server Components; `"use client"` solo donde hay interacción.
- `Button` usa `secondary` por defecto (como `bundle.js`); `primary` se declara siempre explícitamente.

## Reglas que no se negocian

- **`StatusBadge` es la única forma de mostrar los 7 estados del ciclo de vida** (`generado`, `revision`, `aprobado`, `rechazado`, `publicando`, `publicado`, `error`): color + ícono + palabra, siempre los tres.
- **`primary` (azul cobalto) nunca es un color de estado.** Solo para: la acción principal (una por vista), la pestaña activa, la selección (`primary-soft`), el foco y los enlaces. Los estados usan `success`, `warning` y `destructive`.
- Área táctil mínima de 44px (`size-touch`) en todo control, aunque el dibujo sea menor.
- Etapas bloqueadas con `aria-disabled` y el motivo en texto. `IconButton` siempre con `aria-label`. `role="status"` en `publicando` y en el toast.
- `ReviewCard`: al aceptar o descartar avanza sola a la siguiente propuesta (200ms, `ease-exit`) y muestra un toast con “Deshacer”; sin diálogos de confirmación. En escritorio, atajos A / D / E.
- `ImageTile`: tocar elige y asigna el número de orden; la 1 es “Portada”; mantener presionado reordena; descartar apaga y deja “Recuperar”.
- `PriceBreakdown`: la ganancia se recalcula en vivo; costos en `chart-1..3`, ganancia en `chart-4`, pérdida en `destructive` con signo menos.
- Dinero con `Intl.NumberFormat('es-CL')` → `$24.990`; negativos con signo menos tipográfico → `−$1.200`. Cifras siempre con `tabular-nums`.
- Foco: 2px del color de fondo + 2px sólidos de `ring` (regla global en `app/globals.css`). `prefers-reduced-motion` lleva todo a 0ms salvo el indicador de publicación (`.motion-exempt`).
- WCAG 2.1 AA en claro y en oscuro.
- Área segura: `env(safe-area-inset-bottom)` (`pb-safe`) en la barra inferior y en las barras de acción fijas.

## Rutas

- **Las rutas van siempre en inglés** (segmentos de URL, carpetas de `app/`, rutas de API y parámetros de búsqueda): `/today`, `/products/[id]/images`, `/api/onboarding/products`, `?filter=stuck`. Los textos visibles siguen en español.
- `/` es la landing pública (`components/landing/`, diseño `design-system/landing.md`, tipografía Marketing `text-hero|hero-sm|section|lead`, solo ahí); con sesión redirige a Hoy. `/dev/landing` la muestra con la sesión iniciada.
- Pantallas: `/today`, `/products?filter=moving|stuck|published`, `/products/[id]` (`/base`, `/reviews`, `/angles`, `/copy`, `/images`, `/creatives`, `/ads`), `/campaigns?period=today|7|30`, `/campaigns/[id]`, `/settings`. Onboarding: `/auth/create-account`, `/onboarding/shopify|products|numbers|meta|meta/accounts|done`. Integraciones: `/api/onboarding/*`, `/api/products/*`, `/api/webhooks/*`, `/api/cron/*`.
- **No hay etapa Precio.** El precio y los packs se definen en Información base (“Precio y packs”, requisito para optimizar); la ruta tiene 8 etapas: Información base, Reseñas (opcional), Ángulos, Imágenes, Textos (el comerciante la ve como “Página del producto”), Publicar, Creativos (opcional) y Anuncios (opcional). **Imágenes va antes de la Página del producto**: la página usa las imágenes elegidas (galería de la ficha y fotos de los componentes). `/products/[id]/price` y `/productos/[id]/precio` redirigen a `/base`. `design-system/` todavía dibuja la etapa Precio y oferta (es la copia del artifact): en esto manda este archivo.
- Las claves internas siguen el vocabulario del design system (`StageKey` `resenas|angulos|textos|imagenes`, `ProductFilter` `detenidos…`); su traducción a URL vive en `lib/routes.ts` (`productHref`, `FILTER_PARAM`). No armes a mano una URL de etapa.
- Las rutas antiguas en español redirigen de forma permanente (`redirects` en `next.config.ts`). `design-system/arquitectura.md` es la copia del artifact y conserva los nombres originales.

## Textos de UI

Español neutro con tuteo, nunca voseo ni “usted”: “Revisa”, “Elige”, “Tienes 6 decisiones” (nunca “Revisá”, “Elegí”). Verbo primero en botones, sentence case, sin signos de exclamación ni emojis. Los errores dicen qué pasó y qué hacer; los estados detenidos dicen qué falta y desde cuándo. Ver “Contenido y voz” en `design-system/README.md`.

## No tocar sin pedirlo

`proxy.ts`, `lib/supabase/*` y la lógica de auth (las llamadas a `supabase.auth.*`). Excepción ya autorizada (spec D1): las rutas públicas que se autentican solas, el 401 JSON de `/api/*` y el `?next=` del login en `lib/supabase/proxy.ts`.

## Datos

- **Todo el modelo de datos va en inglés**: tablas, columnas, enums y sus valores, claves de JSON guardado, tipos de dominio del backend y rutas de API (`products`, `customer_avatars`, `content_status = 'in_review'`). El español queda para lo que ve el comerciante (textos de UI, mensajes de error) y para los comentarios. Los valores que la UI muestra en español (los estados de `StatusBadge`: `generado`, `revision`…) se traducen en `lib/products/store.ts` (`toUiStatus`), nunca se guardan así.
- Tipos en `lib/types.ts`. La UI lee **solo** a través de `lib/data/*.ts` (`getTodayQueue()`, `getProducts(filter)`, `getProduct(id)`, `getProductBase(id)`…).
- **Reales en Supabase**: productos (`products`, creados desde los elegidos en el onboarding por `lib/products/sync.ts`), imágenes de referencia (`product_reference_images` + bucket privado `product-references`), el mercado (`merchant_settings`) y el pipeline de IA (`pipeline_runs`, `product_briefs`, `customer_avatars`, `ai_generations`). Migración: `supabase/migrations/20260924000000_products_and_optimization.sql`. Lecturas del dueño con RLS; escrituras solo con `service_role` desde el servidor (`lib/products/store.ts`).
- **Obligatorio: un producto eliminado en Shopify se borra entero en DropFlex.** El botón “Sincronizar” de Productos (`POST /api/products/sync` → `syncShopifyProducts` en `lib/products/sync.ts`) trae los activos que faltan y, para cada producto local que ya no existe en la tienda, llama a `deleteProducts` (`lib/products/delete.ts`), que borra: los archivos del bucket `product-references` bajo `<user_id>/<product_id>/`, las filas de `ai_generations`, la fila de `products` (en cascada: `product_reference_images`, `pipeline_runs`, `product_briefs`, `customer_avatars`, `product_pricing`, `pack_labels`, `review_sources`, `review_imports`, `product_reviews`, `angle_rankings`, `angle_briefs`, `copy_runs`, `page_components`, `shopify_files`, `product_publications`, `ad_media`, `ad_campaigns`, `creative_runs` → `creative_concepts` → `creative_assets` y todo lo que cuelga de ellas; las fotos de reseñas viven en el mismo bucket y prefijo), los creativos del bucket `ad-media`, las piezas generadas del bucket `creative-media` y su rastro en `catalog_items` y `onboarding.selected`. Antes de borrar, **pausa sus campañas en Meta** (no las borra: el historial queda en Ads Manager). Reglas:
  - **Toda tabla, columna o asset nuevo ligado a un producto** (textos, imágenes generadas, anuncios, archivos en otro bucket…) debe borrarse en `deleteProducts`: con `on delete cascade` hacia `products` o con un paso explícito ahí. Un `on delete set null` o un archivo en Storage sin borrar es un bug.
  - Primero Storage, después la base: si falla Storage, la fila queda y la próxima sincronización reintenta.
  - Solo se borra con la lista de Shopify leída **completa** (todas las páginas, todos los estados). Borrador o archivado no es eliminado. Si la lectura falla, no se borra nada.
- **Obligatorio: toda generación parte de la imagen base.** En Información base, tocar una imagen de referencia la elige como base (`product_reference_images.is_base`, una por producto, vía `set_base_reference_image`; migración `20260925000000_base_reference_image.sql`). Sin elección, la base es la portada de Shopify y, si no, la primera en uso (`pickBase` en `lib/products/base.ts`). Reglas:
  - Todo agente o paso nuevo que use imágenes (ficha, cliente ideal, ángulos, creativos, anuncios) las toma con `imagesForGeneration` (`lib/products/store.ts`): solo las en uso, **la base primero**, y le dice al modelo cuál es la base (ver `productBriefUser` en `lib/ai/prompts.ts`). Nunca se arma la lista a mano con `!excluded`.
  - La imagen base no se puede excluir: primero se elige otra. Elegir una excluida como base la vuelve a usar.
  - La miniatura del producto en las listas es su imagen base.
- **Obligatorio: precio y packs antes de optimizar.** “Precio y packs” en Información base es la calculadora de dropflex v1 (`lib/pricing/calculator.ts`, con sus tests; redondeo por moneda con `roundingFor`: CLP/COP/PYG/ARS/CRC en …990, el resto en …9). Se guarda en `product_pricing` (migración `20260926000000_product_pricing.sql`): costo del proveedor, envío, CPA objetivo, % confirmados y entregados, precio de venta, tachado, descuento por unidad extra, y lo derivado (equilibrio, recomendado, ganancia, CPA máximo, packs 1x/2x/3x). Reglas:
  - “Optimizar con IA” no parte sin precio guardado (`startOptimization` → 409). La corrida guarda una copia en `pipeline_runs.input.pricing`.
  - Todo paso de IA recibe el precio con `pricingBlock` (`lib/pricing/prompt.ts`): la ficha y el cliente ideal ya lo hacen; los ángulos, textos y anuncios que vengan, también.
  - El servidor recalcula con `buildPricingPlan` antes de guardar (`lib/pricing/store.ts`): nunca se guarda un número derivado que venga del navegador.
  - Guardar no cambia el precio en Shopify: publicarlo es un paso aparte.
  - **Se empujan los packs.** El CPA y el despacho se pagan una vez por pedido: cada unidad extra solo cuesta el producto. Descuento por unidad extra por defecto: 50 % (el pack de 3 queda al precio de 2). El pack recomendado (`withRecommendation`: el más grande mientras cada uno gane más que el anterior) es la OFERTA PRINCIPAL en los prompts; 1 unidad es la referencia de precio.
  - **Etiquetas de los packs** (“2 meses de uso”, “Uno para ti y otro para tu pareja”): la IA las propone en la misma llamada del cliente ideal (`avatarStepSchema` → `pack_labels`, migración `20260927000000_pack_labels.sql`) y el comerciante las decide aparte en “Precio y packs” (aceptar, editar u “Otras etiquetas”, que es una llamada chica en `lib/pipeline/pack-labels.ts`). Duración solo con datos reales de la ficha; nunca “tratamiento” ni promesas de salud. Si cambian los precios, la propuesta queda `stale` y hay que revisarla. A los pasos siguientes (textos, anuncios) solo llegan las **aprobadas**, con `pricingBlock(plan, labels)`.
  - La sección sigue la pantalla de precio del design system: `PriceBreakdown` primero, tres campos (costo, precio, tachado) y los supuestos en una línea con “Cambiar supuestos”.
- **Reseñas (etapa opcional, `/products/[id]/reviews`)**: se importan de AliExpress con la lógica de dropflex v1 (`lib/reviews/aliexpress.ts` puro y testeado, `fetch.ts` con la red; endpoint `feedback.aliexpress.com/pc/searchEvaluation.do`, que no es un contrato). Migración `20260928000000_product_reviews.sql`. Reglas:
  - La importación corre en segundo plano (`after()` → `runImport` en `lib/reviews/store.ts`) y deja su avance en `review_imports`; una activa por producto. Importar otra vez no duplica (`unique (product_id, source, external_id)`).
  - Filtros de `ReviewImporter`: calificación mínima (1, 4 o 5; por defecto 4), traducir (usa la traducción de AliExpress y guarda siempre el original) y solo con fotos. Autor anonimizado (“M***a”). Fotos copiadas a `product-references` bajo `<user_id>/<product_id>/review-*` (solo desde el CDN de AliExpress).
  - Cada reseña entra `in_review`: nada se usa como aprobada ni se publica sin decisión. Editar solo cambia el texto (`body_edited`), nunca calificación, autor, país ni fecha; el original queda guardado. Las alertas (`lib/reviews/flags.ts`) son sugerencias, nunca rechazan.
  - La etapa nunca bloquea ni se bloquea (`reviewsStage` en `lib/products/stages.ts`). La ficha de producto recibe las reseñas con `reviewsForPrompt` (`lib/reviews/rows.ts`): aprobadas primero, nunca rechazadas, marcadas como de compradores del mismo producto en AliExpress.
  - En la tienda **no** se nombra el origen de las reseñas (decisión del comerciante, 2026-09-24): ningún componente muestra «AliExpress». Se publican con la etapa Publicar (`dropflex.reviews`, `dropflex.review_summary`).
- **Todavía de ejemplo** (`lib/mock/`): imágenes generadas, supuestos y el asistente. `docs/esquema-supabase.md` es la propuesta original para esas partes (conceptos en español: al implementarlas, pásalas a inglés).
- Pantallas en `app/(app)/`; piezas interactivas de pantalla en `components/screens/`; shell (layout, asistente, barra fija, estados) en `components/shell/`.
- Rutas con `[id]` de producto no tienen `generateStaticParams`: con `cacheComponents`, todo lo que usa `usePathname` bajo ellas va dentro de `<Suspense>` (ver `AppShell` y `StageNav`).

## IA: "Optimizar con IA"

- Pipeline de agentes creativos: **ficha de producto → cliente ideal** (`lib/pipeline/optimize.ts`) y, en la etapa Ángulos, **orquestador → 2 agentes de ángulo** (`lib/pipeline/angles.ts`). Detalle: `docs/pipeline-ia.md`.
- Claude (`@anthropic-ai/sdk`) en `lib/ai/claude.ts`: `claude-opus-5`, pensamiento adaptativo, salida estructurada validada con zod (`lib/ai/schemas.ts`) y `fallbacks: "default"`. Prompts puros en `lib/ai/prompts.ts` (system estable por mercado, para la caché). Cada llamada queda en `ai_generations` con su costo.
- LATAM con pago contra entrega: el mercado (país, moneda, idioma) se detecta en Shopify al conectar y el comerciante lo confirma en “Tienda conectada” o en Ajustes (`lib/market.ts`, `lib/settings/market.ts`). Todo prompt lleva `marketBlock(market)`.
- La IA propone y el comerciante decide: el cliente ideal entra como `generated` y solo cambia por su acción (aceptar, editar, volver a generar).
- **Etapa Ángulos** (`/products/[id]/angles`, `lib/angles/`, `lib/pipeline/angles.ts`, migración `20260930000000_sales_angles.sql`): se habilita al aprobar el cliente ideal. El orquestador (`angle-router`) evalúa los 6 ángulos (`authority`, `common_enemy`, `unique_mechanism`, `age_identity`, `personal_story`, `offer`) con la ficha, el cliente ideal aprobado y el precio; el comerciante confirma principal y secundario y los 2 agentes de ángulo corren en paralelo. Aprobar los 2 desarrollos habilita Imágenes (y, con las imágenes listas, Textos). Reglas:
  - **El puntaje se calcula en código** (`lib/angles/score.ts`, con tests): el modelo solo da criterios de 0 a 5 y la penalización; los pesos son los del router. Los hechos comprobables pisan al modelo: sin experto real o sin reseñas reales en la ficha, Autoridad e Historia personal se castigan igual. El desglose de “Cómo se calculó” suma exactamente el puntaje.
  - Los prompts (`lib/angles/prompts.ts`) son los de `agentes-creativos/*.md` adaptados a LATAM: copy en el idioma del mercado, pago contra entrega en vez de garantía, precios de `pricingBlock` (nunca los recalcula la IA) y la ley del país. Cambiar un prompt o un esquema sube `ANGLE_ROUTER_PROMPT_VERSION` / `ANGLE_BRIEF_PROMPT_VERSION`.
  - Los siguientes pasos (textos, estáticos, guiones, copywriter) leen los 2 desarrollos **aprobados** (`angle_briefs.payload`).
- **Etapa Página del producto** (`/products/[id]/copy`, `lib/copy/`, `lib/pipeline/copy.ts`, migraciones `20261001000000_page_copy.sql` y `20261008000000_page_components.sql`, spec `docs/spec-pagina-componentes.md`, diseño `design-system/textos.md`): se habilita con los 2 desarrollos aprobados y las imágenes listas (portada y 4 de galería; `CopyState.locked` dice qué falta). En la UI se llama “Página del producto” (`COPY_STAGE_TITLE`). Una sola llamada a Claude escribe la **ficha** (campos nativos: título, nombre corto, descripción corta, oferta, SEO; `lib/copy/listing.ts`) y el contenido de **cada componente de conversión** del catálogo (`lib/shopify/components`). Se guarda en `page_components` (uno vigente por componente). Reglas:
  - El esquema de la llamada se arma desde el catálogo (`pageSchema`, versión holgada de cada `content.ts`); la respuesta se valida con el esquema estricto + `pageProblems` (reseñas que no existen, montos que no son de PRECIO Y OFERTA, palabras internas, promesas prohibidas, la oferta sin el pago al recibir, la misma frase en dos componentes). Si falla se pide otra vez con lo que falló; nunca se recorta ni completa en silencio. Un test mide el esquema contra los límites de la salida estructurada. Cambiar el prompt o el esquema sube `COPY_PROMPT_VERSION`.
  - Los hechos (reseñas, plazos, políticas, stock) nunca los escribe la IA: van como tokens que llena la tienda. Los componentes con `minReviews` no se escriben ni se usan sin esas reseñas aprobadas.
  - La etapa termina con la **ficha aprobada**; los componentes son opcionales («Usar en la página»). Activar un componente o guardar su hoja lo aprueba. Reescribir nunca toca lo aprobado.
  - **Vista previa**: `components/store-preview/` (un preview por componente, `StoreFrame`, `registry.ts`) repite el marcado del Liquid; el CSS y los íconos se generan del tema con `npm run store-preview` (también lo corre `npm run shopify:components`). Un componente nuevo del catálogo necesita su preview (el test lo exige).
  - Las fotos de un componente se eligen del catálogo del producto (`lib/copy/images.ts`: Información base + Imágenes); se guardan en `page_components.images`.
  - **Color de la página**: `products.page_accent_color` (`#rrggbb`, migración `20261002000000_page_accent_color.sql`), elegido en la misma pantalla de una paleta con contraste AA (`lib/copy/accent.ts`) o a mano. Los hex de la paleta viven en `lib/`, nunca en `components/` ni `app/` (van por `style`); la vista previa aplica los mismos tonos que `df-accent-vars.liquid` (`lib/store-preview/accent.ts`).
- **Etapa Publicar** (`/products/[id]/publish`, `lib/pipeline/publish.ts`, `lib/pipeline/theme.ts`, `lib/shopify/publish/`, migraciones `20261009000000_store_policies.sql` y `20261010000000_publish.sql`, spec `docs/spec-publicar.md`): se habilita con la página y las imágenes listas. Dos pasos: el **tema** (instalar sin publicar desde un ZIP en memoria, vista previa, publicar con segundo toque, actualizar solo el código que cambió; nunca pisa templates ni `settings_data.json`) y el **producto** (`productSet` con ficha, SEO, galería y los **packs como variantes** de la opción «Pack»; metafields `dropflex.*` de lo aprobado y en uso; lo retirado se borra). Reglas:
  - Publicar necesita `PUBLISH_SCOPES` (temas, archivos y `write_inventory`, para dejar las variantes sin seguimiento y a la venta); conectar sigue pidiendo solo `CONNECT_SCOPES`. Una tienda sin ellos ve «Dar permisos» (reabre el OAuth).
  - Las mutaciones usan `shopifyMutation` (sin reintentos de transporte); todo es idempotente. Las imágenes van por staged upload a Shopify Files, con caché en `shopify_files`.
  - Los hechos de la tienda (envío gratis, plazos, cambios, garantía, WhatsApp) se editan en **Ajustes › Envíos y políticas** (`lib/settings/policies.ts`) y se publican como `shop.metafields.dropflex.policies` y `.logistics`. Campo vacío = no se promete.
  - Publicar cambia el producto real al instante: se prueba solo en tiendas de desarrollo.
- **Etapa Anuncios** (`/products/[id]/ads`, `lib/ads/`, `lib/pipeline/ads-*.ts`, migración `20261003000000_ads.sql`, spec `docs/spec-anuncios.md`, diseño `design-system/anuncios.md`): se habilita con la página del producto lista y Meta con cuenta, página y píxel. Reglas:
  - **Dos estructuras, ABO y CBO.** Las plantillas del sistema (`lib/ads/presets.ts`: `impulso` por defecto, `gem`, `pancho`, `tfl`, `cbo-winners`) y las propias (`ad_templates`) solo PRECARGAN: la configuración de lanzamiento y la del motor se copian en la campaña (`ad_campaigns.launch` y `.engine`, validadas con `lib/ads/schemas.ts`). **No hay configuración global de motor**: cambiar una campaña no toca las demás.
  - **Todo se crea en PAUSA** (`lib/pipeline/ads-launch.ts`): campaña → medios → conjuntos, creativos y anuncios. Cada objeto se anota en `meta_objects` al crearse; si algo falla se borra en orden inverso y el borrador vuelve con el motivo. «Publicar» es un paso aparte y explícito (y pide un segundo toque).
  - **Tope de gasto diario de la cuenta** (`merchant_settings.ad_daily_spend_cap`, Ajustes › Campañas): obligatorio; ningún lanzamiento lo supera. El CPA límite de cada campaña parte del `max_cpa` del producto (o `purchase_cost_limit`).
  - **Motor** (`lib/ads/engine.ts`, puro y con tests; `lib/pipeline/ads-engine.ts` en el servidor): reglas tipadas en múltiplos del CPA límite; Esperar manda, luego Pausar, luego Escalar. «Solo recomendar» por defecto; «Automático» aplica dentro de los topes (+30 % por paso, tope diario, una acción por espera) y todo cambio queda en `ad_changes` con Deshacer. Crear la CBO de ganadores nunca es automático.
  - **Lectura cada hora** (`lib/pipeline/ads-sync.ts`): `pg_cron` (job `ads-sync-hourly`) llama `/api/cron/ads-sync` con `Bearer CRON_SECRET`, leyendo la URL y el secreto de Vault (`app_base_url`, `cron_secret`, se cargan a mano). `ad_insights_daily` se reescribe mientras Meta asienta; `ad_insights_snapshots` solo se agrega (historial de los gráficos).
  - **Cuenta real, sin cuenta de prueba**: crear, publicar o activar el modo automático en Meta son acciones con dinero real; se prueban solo con autorización explícita del comerciante.
- **Etapa Creativos** (`/products/[id]/creatives`, `lib/creatives/`, `lib/pipeline/creatives.ts`, `lib/integrations/higgsfield/`, migración `20261004000000_creatives.sql`, spec `docs/spec-creativos.md`): opcional, entre Publicar y Anuncios; se habilita con los 2 desarrollos aprobados y la **clave de Higgsfield del comerciante** (Ajustes › Anuncios con IA; en Vault como `higgsfield`, nunca en el navegador). Reglas:
  - Claude (generador de estáticos) propone 6 conceptos con los textos exactos que se hornean; Higgsfield **Marketing Studio 2.5 Flare, 1k, calidad baja** renderiza la pieza terminada desde la imagen base (`imagesForGeneration`). Nada se compone ni se re-renderiza después: cada titular o proporción (1:1 feed, 9:16 Stories) es otra generación.
  - El prompt de render lo arma `lib/creatives/render.ts` (puro, con tests), no el modelo: la regla de texto va siempre igual. Los presets se leen de la API con la clave del comerciante (nunca se hardcodean).
  - **Dirección de arte explícita** (spec §7.4): el generador describe el producto (`product_look`) y el kit de la foto base (`kit`), y cada concepto trae paleta, tipografía, `layout`, unidades, partes del kit y la ubicación de cada texto (callouts solo hacia partes visibles). Problema → solución, Explicativo, Foto nativa y Nota van sin preset. Nada impreso en el producto que no esté en la foto; un accesorio del kit nunca hace de otro objeto. Largos por rol en `ROLE_LIMITS`.
  - Cada pieza pasa por un QA con Claude (producto igual a la foto, textos exactos, sin textos de más). Si falla, un solo reintento automático sin preset. El comerciante decide igual: aprobar copia la pieza a `ad_media` (aparece en Anuncios); descartar o deshacer la saca, salvo que ya esté subida a Meta. **Lo descartado se borra** (`purgeDiscardedCreatives` en `lib/creatives/store.ts`, dentro de `expireStaleCreatives` y al terminar una propuesta): el archivo de `creative-media` y después la fila. Una pieza descartada, pasados 2 minutos (el plazo de Deshacer); al «Proponer otros», todas las piezas de los conceptos reemplazados, también las aprobadas con su copia en Anuncios (`removeAdCopies`: la copia se queda si ya está en Meta o la usa un anuncio, porque `ads.media_id` no borra en cascada), salvo las que siguen generándose (se borran al terminar), y los conceptos que quedan vacíos. El costo queda en `ai_generations`.
  - Todo en segundo plano con `after()`; el sondeo de la pantalla (`GET /creatives`) termina lo que quedó esperando (lease sobre `updated_at`). Sin webhooks. Topes por comerciante: 10 propuestas y 120 imágenes en 24 h.
  - Los textos horneados siguen las reglas del copy: montos solo de PRECIO Y OFERTA, sin promesas de salud ni atributos personales en segunda persona (`textProblems`).
- **Etapa Imágenes** (`/products/[id]/images`, `lib/page-images/`, `lib/pipeline/page-images.ts`, migración `20261007000000_page_images.sql`, spec `docs/spec-imagenes.md`): las imágenes de la página del producto por espacio (Portada 1:1, Galería 1:1 de 4 a 6 ordenadas y 3 Beneficios 3:4 que propone el mismo director desde la ficha y los ángulos, `benefit-1…3`). Va **antes** de la Página del producto: se habilita con los 2 desarrollos de Ángulos aprobados y queda lista con portada y 4 de galería; cambiar los desarrollos la deja desactualizada. «Continuar: Página del producto» empieza a escribir la página.
  - Un director de galería (Claude) propone una toma por espacio con dirección de **campaña editorial** (producto grande, titular dominante, paleta del color del producto, algo en movimiento): es lo que la lleva a nivel de agencia (spec §4). Flare **directo, sin preset y sin `enhance_prompt`**; el prompt lo arma `lib/page-images/render.ts` (puro, con tests).
  - Flare no genera 4:5: los beneficios van en **3:4 nativo**, nunca recortados.
  - Reglas en código (`planProblems`): portada y ambiente sin textos; sin precios, ofertas ni regalos en la imagen; titular con mayúscula inicial; badge y callout de hasta 2 líneas. Props que sugieren un ingrediente, función o accesorio que la ficha no dice van en `props_forbidden`.
  - QA con Claude (producto, textos, texto de la caja impreso en el producto, props engañosos, unidades idénticas, anatomía); si falla, un reintento de la misma toma (`retry_of`) que reemplaza al primero.
  - Opciones de tres orígenes: generadas, fotos de Información base (sin copiarlas) y subidas (bucket `page-media`). Descartar borra archivo y fila pasados 2 minutos; «Proponer otra galería» borra todas las generadas de las tomas anteriores, también las elegidas. Las subidas y las fotos se quedan.
  - Todo en segundo plano con `after()` y sondeo (`GET /page-images`, lease sobre `updated_at`), igual que Creativos. Topes por comerciante en 24 h: 10 galerías y 150 imágenes.
- **Obligatorio: toda generación de IA se registra con `recordAiGeneration`** (`lib/ai/track.ts`), también los intentos fallidos (con su costo si se cobró) y las imágenes de Higgsfield (costo estimado con `IMAGE_COST_USD`, `cost_estimated`). Un paso nuevo se agrega a `AI_STEPS` (`lib/ai/costs.ts`) con su etapa y su nombre; `detail` separa lo que se genera varias veces en un paso (el ángulo, el concepto y la proporción) para distinguir generar, regenerar y reintentar. Un error que ya quedó registrado se relanza con `AiStepError(..., usage, true)` para no contarlo dos veces.
- **Costo de IA por producto** (`design-system/arquitectura.md` › 11, migración `20261005000000_ai_costs.sql`): `getProductAiCost` (`lib/data/ai-costs.ts`) suma `ai_generations` por etapa en la moneda de la tienda (tipo de cambio diario en `lib/ai/fx.ts`, con respaldo fijo). El layout del producto lo entrega a `AiCostProvider`; `AiCostButton` (`AiCostChip`) va en la barra superior de cada pantalla del producto y `AiCostSummary` bajo la ruta; el detalle (`AiCostCard` + `AiRunList`) se abre como hoja en móvil y panel derecho en escritorio. Tope opcional por producto en Ajustes (`merchant_settings.ai_cost_cap`). La vista de administrador (tokens y modelo) solo con `app_metadata.role = "admin"` en Supabase.
- Variables de entorno: `ANTHROPIC_API_KEY` (solo servidor), creada dentro de un workspace; si es una key de organización, también `ANTHROPIC_WORKSPACE_ID` (se envía como header `anthropic-workspace-id`).

## Tema de Shopify y componentes de conversión

- Tema: `lib/shopify/themes/DropPulse` (Shopify Pitch 4.2, familia Horizon). Principios de la integración (tema = estructura, metafields `dropflex.*` = contenido, lo del comerciante no se pisa): `docs/spec-tema-shopify.md`.
- **Componentes de conversión** en `lib/shopify/components/` (reglas en su `README.md`): 13 bloques y secciones propios y portables (`df-*`). Cada uno tiene su Liquid, `content.ts` (lo que escribe la IA: esquema zod, reglas, psicología, ejemplos) y `README.md`. Registro en `catalog.ts`; datos reales compartidos en `SHARED_METAFIELDS` (`define.ts`).
- **Shopify descarta en silencio** un archivo inválido al importar y con él cada template que lo usa (todas las fichas en 404). `lib/shopify/publish/template-rules.test.ts` revisa lo que `theme check` no mira: `{% stylesheet %}`/`{% javascript %}`/`{% schema %}` en el nivel superior, cada ajuste de templates, grupos y `settings_data.json` contra su schema (un `select` guarda texto). Al instalar, el tema se compara archivo por archivo con el kit.
- Se editan en `lib/shopify/components/` y se copian al tema con `npm run shopify:components` (que también regenera la vista previa en React: `npm run store-preview`); **nunca** se editan los `df-*` dentro del tema. `npm run check:shopify` compara las dos cosas y corre `shopify theme check`.
- Cada componente tiene su vista previa en `components/store-preview/<id>.tsx` con el mismo marcado y clases que su Liquid (el CSS se genera del tema). Un componente nuevo: su carpeta, `catalog.ts`, su preview y `registry.ts`.
- Los hechos (inventario, reseñas, calificación, plazos, políticas, archivos) nunca los escribe la IA: van como tokens (`{qty}`, `{count}`, `{min}`…) que llena la tienda con datos reales.
- **La tienda es la landing de un producto** (`lib/shopify/components/_landing`, con su `README.md`): la home, las colecciones, la búsqueda y las páginas redirigen al último producto (`df-landing-redirect`, ajuste `df_landing_mode`); el header va sin menú, buscador ni cuenta, y el pie solo con políticas. El tema lleva el design system de DropFlex (`df-design-system`: Geist, foco, acento del producto en el botón; paleta y radios en `config/settings_data.json`). La ficha (`templates/product.json`) sigue la estructura de referencia: galería con miniaturas y nota de confianza; prueba social, estrellas, título, bajada, precio con ahorro, beneficios, stock, packs (una tarjeta por variante), botón, medios de pago, entrega y descripción. «Tu página» en la app dibuja los bloques en ese mismo orden (`LISTING_SLOTS` en `lib/copy/page-ui.ts`).

## Onboarding

- Rutas: `/auth/create-account` (O1), `/onboarding/*` (pasos 1–4 y Listo), `SetupChecklist` en Hoy y Conexiones en Ajustes. Pasos en `components/onboarding/steps/`.
- Backend **real**: estado en Supabase (`lib/onboarding/store.ts`), Shopify y Meta en `lib/integrations/` (`server-only`), tokens en Vault, migración en `supabase/migrations/`. El avance de generación del onboarding (`GenerationProgress` en los pasos 3 y 4) sigue simulado; la IA real corre por producto con “Optimizar con IA”.
- “Tienda conectada” muestra el mercado detectado (país, moneda, idioma) y lo guarda al tocar “Elegir productos” (`POST /api/onboarding/market`). Contrato, rutas y puesta en marcha: `docs/onboarding-backend.md`; decisiones: `docs/spec-migracion-conexiones.md`.
- Shopify: app no embebida con instalación administrada (`shopify.app.toml` / `shopify.app.dev.toml`); los alcances viven ahí y en `SHOPIFY_SCOPES` de `lib/integrations/shopify/oauth.ts`, siempre iguales.
- Dinero del catálogo en la moneda de la tienda: `money(value, currency)`; CLP es el valor por defecto.
- Los estados de conexión usan `ConnectionCard` / `StateChip`, nunca `StatusBadge` (que es solo para el ciclo de vida del contenido).
- `ProviderMark` es genérico: no dibujes logos de Shopify, Meta ni Google.

## Base de datos local

```bash
supabase start        # aplica supabase/migrations/ la primera vez; usa los puertos 553xx
supabase db reset     # borra todo y vuelve a aplicar las migraciones
supabase stop
```

- Configuración en `supabase/config.toml`: puertos 553xx (API `55321`, DB `55322`, Studio `55323`, correos `55324`) para no chocar con otros proyectos en 543xx; `analytics` apagado (con Colima, el contenedor de logs no monta el socket de Docker).
- `.env.local` apunta a la base local (`supabase status -o env` da las claves). Shopify, Meta y `ANTHROPIC_API_KEY` se completan a mano.
- Una migración nueva: `supabase migration new <nombre>` y luego `supabase migration up` (o `db reset`).

## Verificación

```bash
npm run build
npm run lint
npm run typecheck
npm test                     # vitest: lib/**/*.test.ts
npm run check:valores        # sin hex, rgb() ni px sueltos en app/ y components/
```

Con `npm run dev` corriendo:

```bash
npm run check:a11y           # axe en cada ruta, 390 y 1280px, claro y oscuro
npm run check:teclado        # orden de foco, foco visible y atajos A / D / E
npm run capturas             # docs/capturas/pantallas + montajes contra design-system/screenshots
npm run capturas:componentes # /dev/components contra las capturas de referencia
TEST_EMAIL=… TEST_PASSWORD=… npm run check:onboarding   # usuario con tienda de desarrollo conectada; capturas y axe
```

- `/dev/tokens` y `/dev/components` (solo en desarrollo) para revisar tokens y componentes en claro y oscuro.
- Plan y decisiones: `docs/plan-design-system.md`.
