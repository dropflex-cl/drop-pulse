# Spec: la página del producto con componentes (rediseño de `/products/[id]/copy`)

> Estado: **implementado** (2026-09-24). Pendiente: una escritura real con Claude para validar el esquema combinado contra la API.
> Reemplaza el modelo de bloques de `docs/spec-textos.md` (11 bloques con revisión uno a uno) por la ficha + el catálogo de componentes de conversión de `lib/shopify/components`.
> Decisiones tomadas con el usuario: (1) ficha nativa + componentes; (2) una llamada genera todo y después se elige; (3) cada componente se edita en sus campos y se aprueba; (4) la etapa Imágenes sigue igual y los selectores muestran lo que haya.

## 0. Resumen

La etapa «Página del producto» deja de ser una fila de tarjetas de texto y pasa a mostrar **cómo se verá la página en la tienda**:

1. **Ficha** (campos nativos de Shopify): título, nombre corto, descripción corta, frase de la oferta, título y descripción para Google. Obligatoria.
2. **Componentes**: los 14 de `lib/shopify/components/catalog.ts` (13 originales + `gif-strip`, los textos de los GIF), cada uno como **mini preview en React** fiel al Liquid, con el color del producto. Cada uno tiene un interruptor **«Usar en la página»**: lo marcado es lo que Publicar habilitará en la landing.

**Una sola llamada a Claude** devuelve la ficha y el contenido de todos los componentes. Tocar un componente abre sus campos (formulario armado desde su esquema zod) y, si lleva imágenes, un selector con **todas las imágenes del producto**.

## 1. Qué cambia respecto de hoy

| Hoy | Nuevo |
|---|---|
| 11 bloques fijos (`lib/copy/blocks.ts`) en `content_items`, un registro por texto | Ficha + 13 componentes en `page_components`, un registro por componente con su contenido json |
| Revisión uno a uno (aceptar/editar/descartar, A/D/E) | Previews; interruptor «Usar en la página»; hoja de edición por componente |
| Beneficios, FAQ, envío y pago, garantía como bloques de texto | Viven dentro de sus componentes (`image-with-benefits`, `faq-and-text`, `benefit-double-box`…) |
| El HTML de la descripción lo armaría Publicar | Publicar escribe la ficha en los campos nativos y los componentes en `dropflex.<id>` (spec-tema-shopify) |

Se mantienen: `copy_runs` (una escritura = una llamada), el disparo en segundo plano con `after()` + sondeo, `recordAiGeneration`, el color de la página (`page_accent_color`), los estados de la etapa (bloqueada, empezar, escribiendo, falló, lista, desactualizada) y «lo aprobado nunca se reescribe».

## 2. Modelo de datos

Migración `20261008000000_page_components.sql`:

```sql
create table public.page_components (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  run_id        uuid not null references public.copy_runs on delete cascade,
  component     text not null,          -- 'listing' (la ficha) o un id de catalog.ts
  position      smallint not null,      -- orden en la página (el del catálogo)
  proposal      jsonb not null,         -- lo que escribió la IA (validado con su content.ts)
  content       jsonb,                  -- la versión del comerciante; null = usa proposal
  enabled       boolean not null default false,  -- «Usar en la página» (la ficha siempre true)
  images        jsonb not null default '[]',     -- [{ slot, source: 'reference'|'page_image', id }]
  status        public.content_status not null default 'generated',  -- generated → approved
  decided_at    timestamptz,
  superseded_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index page_components_active on public.page_components (product_id, component) where superseded_at is null;
-- RLS: el dueño lee; escribe solo service_role (lib/copy/store.ts).
```

- **`content_items` se elimina** (y su lectura en `lib/data`, `stages`, `page-images`). En desarrollo se pierden los textos generados con el modelo anterior; se vuelven a escribir con un toque.
- `deleteProducts` no necesita pasos nuevos: todo cuelga de `products` en cascada.
- **Estados:** `generated` al escribir; **activar «Usar en la página» o guardar la hoja = `approved`**; desactivar deja `enabled = false` y conserva el contenido. La ficha se aprueba con su propio botón y es requisito para terminar la etapa.
- Al reescribir: los componentes `approved` se conservan (y van como contexto a la IA); los demás se reemplazan (`superseded_at`).

## 3. La llamada a Claude

- Un solo `generateStructured` con este esquema, armado desde el catálogo (`lib/copy/page-schema.ts`, puro):

  ```ts
  z.object({
    listing: listingSchema,                            // la ficha (lib/copy/listing.ts)
    components: z.object({ [c.id]: c.content, … }),    // uno por componente con metafield
  })
  ```
- **Prompt** (`lib/copy/prompts.ts`, reescrito): el system estable por mercado (caché) con las reglas generales (tuteo, pago contra entrega, sin inventar hechos, Ley 19.496) y, por componente, lo que ya declara su `content.ts`: `placement`, `objection`, `levers`, `rules`, `forbidden`. El user lleva la ficha, el cliente ideal, los 2 desarrollos aprobados, `pricingBlock`, las políticas reales y **las reseñas aprobadas con su id** (para `review-slider` y el testimonio de `stats-with-image`). Una regla transversal: **repartir las objeciones** (USPs sobre el botón = envío, origen, soporte; doble tarjeta bajo el botón = pago y garantía; FAQ = lo que queda).
- **Validación:** `safeParse` de cada componente + `pageProblems` (montos que no son de PRECIO Y OFERTA, garantía sin días, ids de reseña que no existen, repetición entre componentes). Si falla, **un** reintento con los problemas; si vuelve a fallar, la escritura queda con error (igual que hoy). Nunca se recorta en silencio.
- **Tamaño del esquema:** la salida estructurada compila el esquema a una gramática y la API rechaza las muy grandes. Un test mide `z.toJSONSchema(pageSchema)` contra un presupuesto; si algún `content.ts` lo excede, se compacta (describe más corto, enums compartidos). Tokens de salida estimados: 6–9 k → `maxTokens: 16000`.
- Sube `COPY_PROMPT_VERSION` a 3 y el paso de `AI_STEPS` sigue siendo `page_copy`.

## 4. Imágenes

- Cada componente declara sus ranuras en `content.ts` (campo nuevo `imageSlots`): p. ej. `image-with-benefits` → `main` (1, 3:4); `stats-with-image` → `collage` (1–4); `insta-story` → `stories` (una por story); `benefit-double-box` → `card_1`/`card_2` (opcional, logos).
- El selector muestra **todo el catálogo del producto**: fotos de Información base (`product_reference_images`) y las de Imágenes (`page_images` generadas y subidas, no descartadas), con su origen. Elegir guarda `{ slot, source, id }` en `page_components.images`; Publicar las sube a Shopify Files.
- **La etapa Imágenes no cambia**: sus tomas de beneficio salen ahora de los beneficios de `image-with-benefits` (antes: bloques `benefit`). Si un componente habilitado no tiene imagen, la tarjeta dice «Falta imagen» y el selector ofrece ir a Imágenes.
- Videos (`ugc-slider`, stories en video) quedan fuera de esta etapa: se suben en Publicar o en una etapa de medios futura. Sus componentes se previsualizan con el póster o un marcador.

## 5. Previews en React

- `components/store-preview/`: un archivo por componente (`inventory.tsx`, `faq-and-text.tsx`…) + `StoreFrame` (marco de teléfono de 375 px, fondo blanco de tienda) + `registry.ts` (id → preview). Mismas proporciones, jerarquía y estados que el Liquid; **sin** JS pesado (el carrusel se muestra como fila con scroll, las stories como círculos + la primera abierta al tocar).
- **Excepción a la regla de tokens**, igual que `OfferPreview`: es otra superficie (la tienda). La paleta de tienda vive en `lib/store-preview/palette.ts` y el acento del producto llega por `style` con los mismos tonos derivados que `df-accent-vars` (función pura `accentVars(hex)` en `lib/store-preview/accent.ts`, con test que la compara con la escalera del Liquid). `check:valores` suma `components/store-preview/` a sus excepciones documentadas.
- **Datos de ejemplo vs reales:** los tokens se llenan con datos reales si existen (resumen de reseñas, políticas, logística); si no, con un ejemplo marcado «Ejemplo» en el preview, para que nadie crea que es su dato.
- Un test por preview renderiza cada ejemplo de su `content.ts` (react-dom/server) para que un cambio de esquema no rompa la pantalla.

## 6. La pantalla

**Móvil (lo principal):**
- Barra superior con `StageMeter` y costo de IA (como hoy). Estados de la etapa iguales a hoy con `EmptyState`.
- **Ficha**: tarjeta con la vista del comprador (`OfferPreview` con título, precio, oferta) y «Revisar ficha», que abre la hoja con sus 6 campos y «Aprobar ficha».
- **Componentes**, en el orden de la página y agrupados («Junto al botón de compra», «Cuerpo de la página»): cada `ComponentCard` muestra nombre, qué objeción responde (una línea), el mini preview escalado, el interruptor «Usar en la página» (44 px, `Switch`) y, si aplica, «Falta imagen».
- Tocar el preview abre la **hoja de edición** (`Drawer`): preview arriba (se actualiza en vivo), campos abajo con `Field` + `CharCount`, listas con agregar/quitar dentro de min–max, selector de ícono (claves de `ICON_KEYS` con su dibujo), `ImagePicker` para las ranuras y «Guardar» (= aprobar y usar). El formulario se arma desde el esquema zod (`lib/copy/form.ts`, puro: zod → campos).
- Barra fija: «Reescribir lo no aprobado» y «Continuar: Imágenes» (se habilita con la ficha aprobada).

**Escritorio:** tres columnas: ruta de etapas · lista de componentes con interruptores · la página completa armada en el marco de teléfono (ficha + componentes habilitados, en orden). Editar abre el panel derecho en vez de la hoja.

Accesibilidad: el preview es `aria-hidden` con una descripción textual al lado (lo que dice el componente), el interruptor tiene nombre accesible («Usar Disponibilidad en la página»), foco y reduced-motion como el resto de la app. Textos en español neutro con tuteo.

## 7. Qué toca en otras etapas

- `lib/products/stages.ts`: la etapa termina con la ficha aprobada; el resumen dice «N componentes en la página».
- `lib/page-images/store.ts` › `pageCopy()`: lee la ficha y los beneficios de `image-with-benefits`.
- `design-system/textos.md`: se reescribe para el nuevo diseño (el design system es la fuente de verdad de la UI).
- `docs/spec-textos.md`: queda como histórico con un aviso que apunta aquí.
- `CLAUDE.md`: la sección «Etapa Textos».

## 8. Plan de fases

1. **Contratos**: `listing.ts`, `imageSlots` en el catálogo, `page-schema.ts` + test de tamaño, `form.ts` (zod → campos) con tests.
2. **Datos y pipeline**: migración, `lib/copy/store.ts`, `runCopy` con la llamada única, validación y reintento, rutas `GET/POST /copy` y `PATCH /copy/components/[component]` (contenido, `enabled`, imágenes), `GET /copy/images` (catálogo de imágenes).
3. **Previews**: `StoreFrame`, 13 previews + ficha, `accentVars`, tests de render; revisión visual en `/dev/components`.
4. **Pantalla**: `ComponentCard`, hoja de edición, `ImagePicker`, móvil y escritorio, estados.
5. **Dependencias y limpieza**: stages, Imágenes, borrar `content_items` y lo que quede sin uso (`ReviewFlow` en esta etapa, `PageOutline`/`CopySummary` si nadie más los usa), docs.
6. **Verificación**: build, lint, typecheck, tests, `check:valores`, `check:a11y` y `capturas` en 390 y 1280, claro y oscuro. **Una corrida real con Claude solo con tu autorización** (cuesta una llamada).

## 8b. Cómo quedó (diferencias con la propuesta)

- **El catálogo de imágenes va en el estado de la etapa** (`CopyState.images`, `lib/copy/images.ts`), no en una ruta `GET /copy/images` aparte: la pantalla ya lo sondea.
- **Esquema holgado para la llamada** (`loosen` en `lib/copy/page-schema.ts`): la salida estructurada recibe la forma sin límites ni refinamientos (van escritos en cada descripción) y la respuesta se valida con el esquema estricto de cada `content.ts`. Un refinamiento que falla dentro del SDK rompería la llamada sin decir qué corregir.
- **Fidelidad del preview por generación, no por copia**: `npm run store-preview` (`lib/store-preview/generate.ts`) arma `components/store-preview/store.generated.css` desde `df-components.css` y los `{% stylesheet %}` (con `@media` → `@container store`, porque el marco mide 375 px), y `lib/store-preview/theme.generated.ts` con los íconos y los valores por defecto de cada `{% schema %}`. Los previews en React repiten el marcado y las clases del Liquid; un test exige que lo generado esté al día (`check:shopify` también).
- **Reseñas mínimas = `min_reviews` del Liquid** (`minReviews` en `content.ts`: 3 en Estrellas y Reseñas). Sin ellas el componente no se escribe ni se puede usar.
- **Políticas en el preview** (`policyActive`): se ocultan como en la tienda los ítems de cambios, garantía o WhatsApp si la tienda no los tiene; los de plazo de entrega se muestran con su ejemplo marcado (la logística todavía no se carga en la app).
- **Beneficios de Imágenes**: salen de «Foto y razones» (`image-with-benefits`) aprobado y en uso; el id de cada uno es `<id del componente>.<n>`.

## 9. Riesgos

- **Esquema grande en una llamada**: es el mayor riesgo técnico; el test de tamaño lo detecta antes de gastar. Si no cabe, el plan B es compactar los `content.ts`, no partir la llamada.
- **Fidelidad del preview**: son dos implementaciones (Liquid y React) del mismo componente. Se atan por los ejemplos de `content.ts` (ambos los renderizan) y por las capturas.
- **Datos reales ausentes** (reseñas, logística, políticas todavía no se publican como metafields): el preview muestra «Ejemplo» y el componente en la tienda no se muestra; la pantalla lo dice en la tarjeta («Necesita reseñas aprobadas»).
