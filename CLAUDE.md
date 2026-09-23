# DropFlex

Herramienta para comerciantes de dropshipping con pago contra entrega: la IA genera el contenido de cada producto (textos, imágenes, anuncios) y el comerciante decide qué se publica en su tienda y en Meta Ads. Mobile first: el usuario trabaja desde el teléfono, en ratos cortos, y necesita saber en segundos qué le toca decidir.

## Stack

- Next.js 16 (App Router, Turbopack, `cacheComponents: true`, `proxy.ts` en lugar de `middleware.ts`), React 19, TypeScript.
- Tailwind CSS v4 (sin `tailwind.config.*`: los tokens viven en `app/globals.css`) + `tw-animate-css`.
- shadcn/ui (new-york) en `components/ui/`, sobre `radix-ui`, `vaul` (drawer) y `sonner` (toast).
- Supabase Auth con `@supabase/ssr`. Íconos con `lucide-react`. Tema con `next-themes` (`attribute="class"`, `defaultTheme="system"`).
- Fuentes Geist y Geist Mono con `next/font/google` (`--font-geist-sans` / `--font-geist-mono` → `font-sans` / `font-mono`).

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
- Pantallas: `/today`, `/products?filter=moving|stuck|published`, `/products/[id]` (`/base`, `/copy`, `/images`, `/price`), `/campaigns?period=today|7|30`, `/campaigns/[id]`, `/settings`. Onboarding: `/auth/create-account`, `/onboarding/shopify|products|numbers|meta|meta/accounts|done`. Integraciones: `/api/onboarding/*`, `/api/products/*`, `/api/webhooks/*`, `/api/cron/*`.
- Las claves internas siguen el vocabulario del design system (`StageKey` `textos|imagenes|precio`, `ProductFilter` `detenidos…`); su traducción a URL vive en `lib/routes.ts` (`productHref`, `FILTER_PARAM`). No armes a mano una URL de etapa.
- Las rutas antiguas en español redirigen de forma permanente (`redirects` en `next.config.ts`). `design-system/arquitectura.md` es la copia del artifact y conserva los nombres originales.

## Textos de UI

Español neutro con tuteo, nunca voseo ni “usted”: “Revisa”, “Elige”, “Tienes 6 decisiones” (nunca “Revisá”, “Elegí”). Verbo primero en botones, sentence case, sin signos de exclamación ni emojis. Los errores dicen qué pasó y qué hacer; los estados detenidos dicen qué falta y desde cuándo. Ver “Contenido y voz” en `design-system/README.md`.

## No tocar sin pedirlo

`proxy.ts`, `lib/supabase/*` y la lógica de auth (las llamadas a `supabase.auth.*`). Excepción ya autorizada (spec D1): las rutas públicas que se autentican solas, el 401 JSON de `/api/*` y el `?next=` del login en `lib/supabase/proxy.ts`.

## Datos

- **Todo el modelo de datos va en inglés**: tablas, columnas, enums y sus valores, claves de JSON guardado, tipos de dominio del backend y rutas de API (`products`, `customer_avatars`, `content_status = 'in_review'`). El español queda para lo que ve el comerciante (textos de UI, mensajes de error) y para los comentarios. Los valores que la UI muestra en español (los estados de `StatusBadge`: `generado`, `revision`…) se traducen en `lib/products/store.ts` (`toUiStatus`), nunca se guardan así.
- Tipos en `lib/types.ts`. La UI lee **solo** a través de `lib/data/*.ts` (`getTodayQueue()`, `getProducts(filter)`, `getProduct(id)`, `getProductBase(id)`…).
- **Reales en Supabase**: productos (`products`, creados desde los elegidos en el onboarding por `lib/products/sync.ts`), imágenes de referencia (`product_reference_images` + bucket privado `product-references`), el mercado (`merchant_settings`) y el pipeline de IA (`pipeline_runs`, `product_briefs`, `customer_avatars`, `ai_generations`). Migración: `supabase/migrations/20260924000000_products_and_optimization.sql`. Lecturas del dueño con RLS; escrituras solo con `service_role` desde el servidor (`lib/products/store.ts`).
- **Obligatorio: un producto eliminado en Shopify se borra entero en DropFlex.** El botón “Sincronizar” de Productos (`POST /api/products/sync` → `syncShopifyProducts` en `lib/products/sync.ts`) trae los activos que faltan y, para cada producto local que ya no existe en la tienda, llama a `deleteProducts` (`lib/products/delete.ts`), que borra: los archivos del bucket `product-references` bajo `<user_id>/<product_id>/`, las filas de `ai_generations`, la fila de `products` (en cascada: `product_reference_images`, `pipeline_runs`, `product_briefs`, `customer_avatars`, `product_pricing`) y su rastro en `catalog_items` y `onboarding.selected`. Reglas:
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
- **Todavía de ejemplo** (`lib/mock/`): textos e imágenes generados, campañas, supuestos y el asistente. `docs/esquema-supabase.md` es la propuesta original para esas partes (conceptos en español: al implementarlas, pásalas a inglés).
- Pantallas en `app/(app)/`; piezas interactivas de pantalla en `components/screens/`; shell (layout, asistente, barra fija, estados) en `components/shell/`.
- Rutas con `[id]` de producto no tienen `generateStaticParams`: con `cacheComponents`, todo lo que usa `usePathname` bajo ellas va dentro de `<Suspense>` (ver `AppShell` y `StageNav`).

## IA: "Optimizar con IA"

- Primera parte del pipeline de agentes creativos: **ficha de producto → cliente ideal** (`lib/pipeline/optimize.ts`). La siguiente iteración suma `angle-router` y los agentes de ángulo, que leen esa ficha y ese avatar. Detalle: `docs/pipeline-ia.md`.
- Claude (`@anthropic-ai/sdk`) en `lib/ai/claude.ts`: `claude-opus-5`, pensamiento adaptativo, salida estructurada validada con zod (`lib/ai/schemas.ts`) y `fallbacks: "default"`. Prompts puros en `lib/ai/prompts.ts` (system estable por mercado, para la caché). Cada llamada queda en `ai_generations` con su costo.
- LATAM con pago contra entrega: el mercado (país, moneda, idioma) se detecta en Shopify al conectar y el comerciante lo confirma en “Tienda conectada” o en Ajustes (`lib/market.ts`, `lib/settings/market.ts`). Todo prompt lleva `marketBlock(market)`.
- La IA propone y el comerciante decide: el cliente ideal entra como `generated` y solo cambia por su acción (aceptar, editar, volver a generar).
- Variables de entorno: `ANTHROPIC_API_KEY` (solo servidor), creada dentro de un workspace; si es una key de organización, también `ANTHROPIC_WORKSPACE_ID` (se envía como header `anthropic-workspace-id`).

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
