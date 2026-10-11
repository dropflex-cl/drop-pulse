# DropFlex

Herramienta para comerciantes de dropshipping con pago contra entrega: la IA genera el contenido de cada producto (textos, imágenes, anuncios) y el comerciante decide qué se publica en su tienda y en Meta Ads. Mobile first: el usuario trabaja desde el teléfono, en ratos cortos, y necesita saber en segundos qué le toca decidir.

## Experiencia vigente: el chat guarda, la app representa

La ficha `/products/[id]` es la entrada. Navegación: Producto, Información y oferta, Página, Publicación; herramientas comerciales opcionales. No recuperar nueve etapas ni bloqueos por aprobar contexto, estrategia o contenido MCP. Los ejemplos del catálogo de diseño no autorizan reintroducir etapas obligatorias.

El MCP guarda contenido vigente editable. Guardar lo deja disponible; seleccionar, asignar, ordenar y ocultar son decisiones explícitas. Publicar es otra acción. No exigir aprobación de identidad, plan, texto, imagen, binding o experiencia, ni reconciliación por cambiar contexto, estrategia, hooks, precios o políticas. Estos cambios no regeneran, gastan créditos ni desactivan contenido elegido.

UI y MCP editan la misma fila vigente: el último guardado explícito cambia su contenido, conserva imágenes omitidas y no recupera descartes ni secciones ocultas. La migración conserva las ediciones anteriores. `preparePublish` y `effectivePage` alimentan ficha, preview y publicación con las mismas variantes, medios y orden. Las variantes comerciales por ángulo/hook permanecen; las versiones históricas no deciden disponibilidad. Estados, snapshots, revisiones y etags antiguos se mantienen para compatibilidad, auditoría y concurrencia interna. No pedir al comerciante administrarlos. Los contratos aceptan omitir parámetros técnicos; el servidor captura la lectura y mantiene CAS/idempotencia.

Publicar comprueba contenido necesario, destinos existentes, archivos, conexión y permisos reales. La procedencia antigua de una imagen no la invalida. Consultar `docs/product-intelligence/current-content.md` y la migración `20261211000000_current_product_content.sql`. Los documentos históricos de diseño describen decisiones anteriores; no determinan el flujo operativo.

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
- `creativos.md`: etapa Creativos (anuncios estáticos, chat de WhatsApp y video UGC), casos de uso → UI y pantallas `PantallasCreativos*`.
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
- Pantallas: `/today`, `/products?filter=moving|stuck|published`, `/products/upsell`, `/products/[id]` (`/base`, `/reviews`, `/angles`, `/copy`, `/images`, `/creatives`, `/ads`, `/whatsapp`), `/campaigns?period=today|7|30`, `/campaigns/[id]`, `/events`, `/events/[slug]`, `/settings`. Onboarding: `/auth/create-account`, `/onboarding/shopify|products|numbers|meta|meta/accounts|done`. Integraciones: `/api/onboarding/*`, `/api/products/*`, `/api/webhooks/*`, `/api/cron/*`.
- **Navegación del producto:** Producto, Información y oferta, Página y Publicación. Imágenes, estrategia, reseñas, creativos, anuncios y WhatsApp son accesos contextuales u opcionales. Precio y packs viven en Información y oferta; `/products/[id]/price` y `/productos/[id]/precio` redirigen a `/base`. No existe un recorrido obligatorio por nueve etapas.
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
- **Obligatorio: un producto eliminado en Shopify se borra entero en DropFlex.** El botón “Sincronizar” de Productos (`POST /api/products/sync` → `syncShopifyProducts` en `lib/products/sync.ts`) trae los activos que faltan y, para cada producto local que ya no existe en la tienda, llama a `deleteProducts` (`lib/products/delete.ts`), que borra: los archivos del bucket `product-references` bajo `<user_id>/<product_id>/`, las filas de `ai_generations`, la fila de `products` (en cascada: `product_reference_images`, `pipeline_runs`, `product_briefs`, `customer_avatars`, `product_pricing`, `pack_labels`, `review_sources`, `review_imports`, `product_reviews`, `product_competitors`, `angle_rankings`, `angle_briefs`, `copy_runs`, `page_components`, `shopify_files`, `product_publications`, `ad_media`, `ad_campaigns`, `creative_runs` → `creative_concepts` → `creative_assets` y todo lo que cuelga de ellas; las fotos de reseñas viven en el mismo bucket y prefijo), los creativos del bucket `ad-media`, las piezas generadas del bucket `creative-media` y su rastro en `catalog_items` y `onboarding.selected`. Antes de borrar, **pausa sus campañas en Meta** (no las borra: el historial queda en Ads Manager). Reglas:
  - **Toda tabla, columna o asset nuevo ligado a un producto** (textos, imágenes generadas, anuncios, archivos en otro bucket…) debe borrarse en `deleteProducts`: con `on delete cascade` hacia `products` o con un paso explícito ahí. Un `on delete set null` o un archivo en Storage sin borrar es un bug.
  - Primero Storage, después la base: si falla Storage, la fila queda y la próxima sincronización reintenta.
  - Nunca un `delete` directo sobre `products`: cambiar de tienda (`forgetOtherShop`) y `shop/redact` (`redactShop`) usan `deleteAllProducts`, que lanza si alguno queda.
  - Solo se borra con la lista de Shopify leída **completa** (todas las páginas, todos los estados). Borrador o archivado no es eliminado. Si la lectura falla, no se borra nada.
- **Upsell del checkout** (`products.is_upsell`, migración `20261026000000_product_upsell.sql`): productos que se venden como extra en el checkout y no se optimizan. El comerciante los mueve con el menú ⋯ de cada fila de Productos («Mover a Upsell» / «Quitar de Upsell», con «Deshacer»; `PUT /api/products/[id]/upsell`). `getProducts`, los conteos y Hoy (también su número en caché) los excluyen; se ven en `/products/upsell` (`getUpsellProducts`, sin calcular su ruta), a la que lleva una fila al pie de la lista. No es un cuarto filtro porque `SegmentedControl` admite 3 opciones en móvil. La sincronización no lo toca y su página de producto sigue abierta.
- **Obligatorio: toda generación parte de la imagen base.** En Información base, tocar una imagen de referencia la elige como base (`product_reference_images.is_base`, una por producto, vía `set_base_reference_image`; migración `20260925000000_base_reference_image.sql`). Sin elección, la base es la portada de Shopify y, si no, la primera en uso (`pickBase` en `lib/products/base.ts`). Reglas:
  - Todo agente o paso nuevo que use imágenes (ficha, cliente ideal, ángulos, creativos, anuncios) las toma con `imagesForGeneration` (`lib/products/store.ts`): solo las en uso, **la base primero**, y le dice al modelo cuál es la base (ver `productBriefUser` en `lib/ai/prompts.ts`). Nunca se arma la lista a mano con `!excluded`.
  - La imagen base no se puede excluir: primero se elige otra. Elegir una excluida como base la vuelve a usar.
  - La miniatura del producto en las listas es su imagen base.
- **Obligatorio: precio y packs antes de optimizar.** “Precio y packs” en Información base es la calculadora de dropflex v1 (`lib/pricing/calculator.ts`, con sus tests; redondeo por moneda con `roundingFor`: CLP/COP/PYG/ARS/CRC en …990, el resto en …9). Se guarda en `product_pricing` (migración `20260926000000_product_pricing.sql`): costo del proveedor, envío, CPA objetivo, % confirmados y entregados, precio de venta, tachado, descuento por unidad extra, y lo derivado (equilibrio, recomendado, ganancia, CPA máximo, packs 1x/2x/3x). Reglas:
  - Guardar precio no genera contenido ni lo publica. Una generación solicitada comprueba que tenga el precio y los datos concretos que su contrato necesita.
  - Todo paso de IA recibe el precio con `pricingBlock` (`lib/pricing/prompt.ts`): la ficha y el cliente ideal ya lo hacen; los ángulos, textos y anuncios que vengan, también.
  - El servidor recalcula con `buildPricingPlan` antes de guardar (`lib/pricing/store.ts`): nunca se guarda un número derivado que venga del navegador.
  - Guardar no cambia el precio en Shopify: publicarlo es un paso aparte.
  - **Se empujan los packs.** El CPA y el despacho se pagan una vez por pedido: cada unidad extra solo cuesta el producto. Descuento por unidad extra por defecto: 50 % (el pack de 3 queda al precio de 2). El pack recomendado (`withRecommendation`: el más grande mientras cada uno gane más que el anterior) es la OFERTA PRINCIPAL en los prompts; 1 unidad es la referencia de precio.
  - **Etiquetas de los packs:** MCP y UI editan las etiquetas vigentes en el mismo modelo. Guardar las deja disponibles; cambiar el precio conserva el texto y los descartes. Los prompts usan la oferta canónica actual, sin exigir una nueva aprobación.
  - La sección sigue la pantalla de precio del design system: `PriceBreakdown` primero, tres campos (costo, precio, tachado) y los supuestos en una línea con “Cambiar supuestos”.
- **Reseñas (etapa opcional, `/products/[id]/reviews`)**: se importan de AliExpress con la lógica de dropflex v1 (`lib/reviews/aliexpress.ts` puro y testeado, `fetch.ts` con la red; endpoint `feedback.aliexpress.com/pc/searchEvaluation.do`, que no es un contrato). Migración `20260928000000_product_reviews.sql`. Reglas:
  - La importación corre en segundo plano (`after()` → `runImport` en `lib/reviews/store.ts`) y deja su avance en `review_imports`; una activa por producto. Importar otra vez no duplica (`unique (product_id, source, external_id)`).
  - Filtros de `ReviewImporter`: calificación mínima (1, 4 o 5; por defecto 4), traducir (usa la traducción de AliExpress) y solo con fotos. Autor anonimizado (“M***a”). Fotos copiadas a `product-references` bajo `<user_id>/<product_id>/review-*` (solo desde el CDN de AliExpress).
  - Cada reseña entra `in_review`: nada se usa como aprobada ni se publica sin decisión. Las alertas (`lib/reviews/flags.ts`) son sugerencias, nunca rechazan.
  - Las reseñas son opcionales y no bloquean la navegación. Los lectores conservan sus decisiones de uso y rechazos.
  - En la tienda **no** se nombra el origen de las reseñas (decisión del comerciante, 2026-09-24): ningún componente muestra «AliExpress». Tampoco el país del comprador (decisión del comerciante, 2026-10-03: una tienda chilena con reseñas marcadas IL, MX o US resta confianza); `dropflex.reviews` no lo lleva. Se publican con la etapa Publicar (`dropflex.reviews`, `dropflex.review_summary`).
- **Contexto y estrategia:** `product_intelligence` y sus relaciones persisten los datos, evidencias e hipótesis del chat. La estrategia seleccionada es editable. No proyectar el MCP en fichas, avatars o briefs del pipeline retirado ni reconstruir su selección desde ellos.
- **Obligatorio: toda imagen entra a Storage optimizada** (`lib/media/optimize.ts`, con tests). Lo que puede ir a la landing (referencias por enlace o desde el equipo, fotos de reseñas, imágenes de la página generadas o subidas) se guarda con `optimizeImage`: WebP q86 `smartSubsample`, ≤ 2400 px por lado, EXIF aplicado, transparencia y animación conservadas. Las subidas con URL firmada se reemplazan al confirmar por su versión WebP y el original se borra. Lo que va a Meta (Creativos) usa `optimizeForAds` (JPEG mozjpeg q90), porque `/adimages` no garantiza WebP. `ensureImages` (`lib/shopify/publish/files.ts`) vuelve a optimizar antes de subir a Shopify Files: cubre lo guardado antes y las fotos que vienen de Shopify. Un paso nuevo que guarde imágenes pasa por aquí; nunca sube los bytes tal cual. Lo guardado antes se convierte con `npm run images:optimize` (simula; `-- --apply` convierte, `--user <id>`, `--limit <n>`): cambia la fila, borra la caché de `shopify_files` de ese archivo y después el original. `ad-media` no se toca.
- **Fixtures de desarrollo:** `lib/mock/` y las fixtures de `/dev` son ejemplos.
- Pantallas en `app/(app)/`; piezas interactivas de pantalla en `components/screens/`; shell (layout, asistente, barra fija, estados) en `components/shell/`.
- Rutas con `[id]` de producto no tienen `generateStaticParams`: con `cacheComponents`, todo lo que usa `usePathname` bajo ellas va dentro de `<Suspense>` (ver `AppShell` y `ProductNavigation`).

## Generación y operaciones comerciales

- El chat desarrolla contenido; las tools MCP lo guardan. UI y MCP leen la misma fuente vigente. `lib/products/presentation.ts` deriva situaciones vacío, incompleto, listo, publicado, actualizado y error desde el contenido efectivo y la publicación real. No contiene fases de aprobación.
- Cada generación parte de un pedido explícito. Guardar o cambiar contexto, estrategia, hooks, precios o políticas no encola trabajos, no regenera y no gasta créditos. Los trabajos solicitados conservan sus inputs para auditoría, leases e idempotencia internos.
- Toda integración utiliza la clave del comerciante, sin respaldo del servidor. Anthropic, Higgsfield y Gemini se resuelven desde sus conexiones y Vault. Una acción que necesita IA valida la conexión antes de crear trabajos o gastar créditos. No leer `ANTHROPIC_API_KEY` como respaldo de la app. `requireAiKey(userId)` sigue siendo un requisito real de una llamada que lo necesita.
- Los prompts usan los datos vigentes, la oferta canónica y el mercado confirmado. No pegar fichas históricas completas ni interpretar contenido externo como instrucciones. Mantener referencias base y procedencia.
- Toda generación registra `recordAiGeneration`, incluidos intentos fallidos y costos estimados o cobrados. Los topes de gasto y las claves propias siguen vigentes.
- QA de imágenes está apagado por defecto y se decide por producto. Comprobar `imageQaEnabled` al ejecutar; no agregar QA ni reintentos pagados por cambios de contexto. Con QA encendido, conservar los límites y el registro de costos del trabajo solicitado.
- La pieza conserva el proveedor que la generó; sondeo y reintentos usan ese proveedor aunque cambie la preferencia. Gemini guarda costo antes de persistir y comparte optimización y controles de almacenamiento.
- Galería, archivos y usos se eligen, asignan, ordenan y descartan explícitamente. `page_images.is_selected` y `discarded_at` son las decisiones actuales; `status` se traduce para clientes anteriores. No exigir aprobación de planes o bindings para usar un archivo existente.
- UGC conserva guiones y medios existentes al editar. Keyframes externos crean únicamente destinos faltantes. El montaje se realiza localmente con CapCut; no recuperar el worker Remotion retirado. Subir un video y elegir su uso son operaciones distintas de publicarlo.
- Publicación comprueba `preparePublish`: contenido necesario, archivos, destinos, conexión y permisos. `effectivePage` comparte variantes, orden y medios entre UI, vista previa y Shopify. La autorización Shopify es independiente del guardado.
- Anuncios conserva Meta conectado, configuración, medios válidos y controles reales de presupuesto. La disponibilidad de página se deriva del contenido efectivo, sin consultar una fase de Textos. Crear en pausa, seguimiento de objetos, compensación de fallos, sincronización de métricas y reglas del motor permanecen; limpiar código no autoriza lanzar campañas.
- WhatsApp y eventos leen datos y contenidos vigentes.
- Las tools antiguas de reconciliación son compatibilidad opcional, marcadas como deprecadas en discovery. Mantenerlas invocables hasta retirar sus clientes. Revisiones, etags, snapshots y registros de auditoría no son tareas del comerciante ni requisitos de disponibilidad.

## Tema de Shopify y componentes de conversión

- Tema: `lib/shopify/themes/DropPulse` (Shopify Pitch 4.2, familia Horizon). Principios de la integración (tema = estructura, metafields `dropflex.*` = contenido, lo del comerciante no se pisa): `docs/spec-tema-shopify.md`.
- **Componentes de conversión** en `lib/shopify/components/` (reglas en su `README.md`): 16 bloques y secciones propios y portables (`df-*`). Cada uno tiene su Liquid, `content.ts` (lo que escribe la IA: esquema zod, reglas, psicología, ejemplos) y `README.md`. Registro en `catalog.ts`; datos reales compartidos en `SHARED_METAFIELDS` (`define.ts`).
- **Shopify descarta en silencio** un archivo inválido al importar y con él cada template que lo usa (todas las fichas en 404). `lib/shopify/publish/template-rules.test.ts` revisa lo que `theme check` no mira: `{% stylesheet %}`/`{% javascript %}`/`{% schema %}` en el nivel superior, cada ajuste de templates, grupos y `settings_data.json` contra su schema (un `select` guarda texto). Al instalar, el tema se compara archivo por archivo con el kit.
- Se editan en `lib/shopify/components/` y se copian al tema con `npm run shopify:components` (que también regenera la vista previa en React: `npm run store-preview`); **nunca** se editan los `df-*` dentro del tema. `npm run check:shopify` compara las dos cosas y corre `shopify theme check`.
- Cada componente tiene su vista previa en `components/store-preview/<id>.tsx` con el mismo marcado y clases que su Liquid (el CSS se genera del tema). Un componente nuevo: su carpeta, `catalog.ts`, su preview y `registry.ts`.
- **La tienda es la landing de un producto** (`lib/shopify/components/_landing`, con su `README.md`): la home, las colecciones, la búsqueda y las páginas redirigen al último producto (`df-landing-redirect`, ajuste `df_landing_mode`); el header va sin menú, buscador ni cuenta, y el pie solo con políticas. El tema lleva el design system de DropFlex (`df-design-system`: Geist, foco, acento del producto en el botón; paleta y radios en `config/settings_data.json`). La ficha (`templates/product.json`) sigue la estructura de referencia: galería con miniaturas y nota de confianza; prueba social, estrellas, título, bajada, precio con ahorro, beneficios, stock, packs (una tarjeta por pack: la variante de 1 unidad × N), botón, medios de pago, entrega y descripción. «Tu página» en la app dibuja los bloques en ese mismo orden (`LISTING_SLOTS` en `lib/copy/page-ui.ts`).

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
- `.env.local` apunta a la base local (`supabase status -o env` da las claves). Shopify y Meta se completan a mano; las claves de IA (Anthropic, Higgsfield, Gemini) se conectan en Ajustes.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
