# Spec: etapa Publicar

> Estado: **implementado** (2026-09-24). Falta probarlo en una tienda de desarrollo (§7).
> Depende de: la Página del producto (ficha aprobada y componentes en uso), Imágenes (portada y galería), Precio y packs (Información base), Reseñas (opcional) y Ajustes › Envíos y políticas.
> Principios del tema y de los metafields: [`spec-tema-shopify.md`](spec-tema-shopify.md).

## 1. Qué hace

La ruta es `/products/[id]/publish`. La etapa tiene dos pasos independientes:

1. **El tema de tu tienda.** Se hace una vez por tienda:
   - Instala el tema de DropFlex **sin publicarlo**, para revisarlo en la vista previa.
   - Lo publica con un segundo toque.
   - Lo actualiza cuando cambia el código del kit.
2. **Tu producto.** Se repite cada vez que haga falta. Lleva a Shopify lo aprobado:
   - la ficha: título, descripción y SEO;
   - los packs, como variantes;
   - la galería;
   - el contenido de la página, en metafields `dropflex.*`.
   
   Cambia en la tienda al instante.

Se puede publicar el producto antes que el tema: el contenido espera en los metafields y se ve cuando el tema de DropFlex esté publicado.

## 2. Requisitos

`preparePublish` en `lib/pipeline/publish.ts` los revisa y la pantalla los muestra:

- **La ficha aprobada.**
- **La portada y al menos 4 imágenes de galería** (`GALLERY_MIN`).
- **El precio guardado** en Precio y packs.
- **Conexión y permisos:** Shopify conectado y con los permisos `read_themes`, `write_themes`, `read_files`, `write_files` y `write_inventory` (`PUBLISH_SCOPES`).
  - Una tienda conectada antes de esta etapa no los tiene. La pantalla muestra «Dar permisos», que reabre el OAuth. `markConnecting` no baja la conexión mientras tanto.
  - Los permisos nuevos tienen que estar en la configuración de la app en Shopify: `shopify app deploy` con `shopify.app.toml` o con `shopify.app.dev.toml`.
  - Para conectar siguen bastando los cuatro de siempre (`CONNECT_SCOPES`).

## 3. Tema (`lib/shopify/publish/theme.ts`, `kit.ts`, `zip.ts`)

- **Instalar:**
  1. Arma un ZIP en memoria con el kit (`lib/shopify/themes/DropPulse`) y lo sube con `stagedUploadsCreate` (FILE). No necesita URL pública ni bucket.
  2. `themeCreate` lo crea como UNPUBLISHED, con nombre `DropFlex <huella>`.
  3. Sondea `processing` cada 3 s durante 5 min como máximo.
  4. Compara el kit completo con el tema: Shopify descarta en silencio lo que no entiende (y cada template que lo usa). Si falta algo, la instalación queda `failed` con la lista.
  - Corre en segundo plano (`after`).
- **App embeds:** copia al `settings_data.json` del kit los bloques `shopify://apps/…` del tema publicado (EasySell, Loox, píxeles). Si ya existen en el kit, mandan los del kit. Es *best effort*: si falla, la instalación sigue.
- **Biblioteca llena (20 temas):** borra solo temas de DropFlex sin publicar, nunca uno del comerciante.
- **Actualizar:** `planUpdate` es una función pura con tests.
  - Compara MD5 contra el tema vivo y sube solo el código que cambió, de a 50 archivos (`themeFilesUpsert`).
  - Repone lo del comerciante que falte (también `settings_data.json`: si no existe, no hay nada que pisar).
  - Borra los `df-*` que ya no existen.
  - Nunca pisa un `templates/**`, `sections/*.json` o `config/settings_data.json` **que el comerciante editó**. Si el archivo de la tienda es idéntico a una versión anterior del kit (huellas de `lib/shopify/publish/kit-history.json`, generado desde git por `npm run shopify:components`), nadie lo tocó y se actualiza. El código sube primero y los templates al final.
- **Publicar:** `themePublish`, solo tras el segundo toque.
- **Estado:** vive en `shopify_theme_installations`. `syncThemeState` corrige el registro si el comerciante borró el tema o publicó otro desde Shopify.

## 4. Producto (`lib/shopify/publish/mapping.ts`, puro y con tests)

- **`productSet`** (síncrono):
  - Envía título, `descriptionHtml` y SEO.
    - La descripción son la descripción corta y los beneficios de *Foto y razones*, en HTML escapado.
  - **Packs = variantes** de una opción `Pack` («1 unidad», «2 unidades», «3 unidades»):
    - El precio sale del plan de precios.
    - El precio tachado es (tachado de 1 unidad, o su precio) × unidades, si es mayor.
    - La variante de 1 unidad conserva la que ya existía (SKU, pedidos).
    - Las de packs llevan SKU `-2x`/`-3x`.
    - **Todas quedan a la venta** (`SELLABLE`, como en v1): `inventoryItem.tracked: false` y `inventoryPolicy: CONTINUE`, también la de 1 unidad y el producto sin packs. El stock lo tiene el proveedor; una variante importada con seguimiento y 0 unidades salía «Agotado». Apagar el seguimiento exige `write_inventory`: sin él Shopify rechaza el `productSet` entero, por eso Publicar lo exige.
    - Al volver a publicar se reusa cada variante por su nombre.
  - Un producto con variantes propias (Color, Talla) no se toca: da un error claro.
  - La galería son la portada, la galería y los beneficios elegidos en Imágenes, en ese orden, como archivos de Shopify Files.
- **Metafields del producto** (`metafieldsSet` de a 25):
  - El contenido de cada componente aprobado y en uso.
  - Las fotos de sus espacios: `stats_with_image_images`, `insta_story_media` y `image_with_benefits_image` (nuevo).
  - `subtitle`, `offer`, `accent`.
  - Las reseñas aprobadas: hasta 30, con 40 fotos como máximo.
  - `review_summary`, con la fuente visible.
- **Borrar también publica:** las llaves de DropFlex que ya no van se quitan con `metafieldsDelete`. Pasa con un componente desactivado, con reseñas o acento que se quitaron.
- **Metafields de la tienda:**
  - `policies` y `logistics`, desde Ajustes › Envíos y políticas.
  - Sin plazos cargados, se borra `logistics`, y los componentes ocultan lo que diga «llega en {min} a {max} días».
- **Definiciones** (`definitions.ts`): se crean una vez con `PUBLIC_READ`. Las que ya existen (TAKEN) se ignoran.
- **Imágenes** (`files.ts`):
  - Se suben con una staged upload (IMAGE), `fileCreate` y una espera hasta READY.
  - Quedan en caché por archivo de origen en `shopify_files`. Si el comerciante borró el archivo en Shopify, se vuelve a subir.
- **Estado:** vive en `product_publications`.
  - Pasa de `publishing` a `published` o a `error`, con un mensaje accionable.
  - La `fingerprint` de lo aprobado muestra «Hay cambios sin publicar».
  - Una publicación que lleva 10 min colgada pasa a error.
- **Mutaciones:** usan `shopifyMutation`, que no reintenta ante cortes de red ni errores 5xx, porque la mutación pudo haberse aplicado. Todo es idempotente y se repite desde la pantalla.

## 5. Envíos y políticas (Ajustes)

Se guardan en `merchant_settings` (migración `20261009000000_store_policies.sql`).

- **Campos:**
  - envío gratis, y desde qué monto;
  - días de cambios;
  - meses de garantía;
  - WhatsApp;
  - días de preparación y de tránsito (mínimo y máximo);
  - hora de corte;
  - si cuenta solo días hábiles y si entrega los sábados.
- **Módulo puro:** `lib/settings/policies.ts`, con tests. Valida y arma los metafields.
- **Campo vacío = «no lo ofrezco»:** lo que lo menciona no aparece en la tienda.
- La vista previa de la Página del producto usa estos mismos datos (`storeFacts`).

## 6. Tablas

Migración `20261010000000_publish.sql`. Toda escritura es con `service_role`; el dueño lee.

- **`shopify_theme_installations`:** una fila por comerciante.
- **`shopify_files`:** cae con el producto.
- **`product_publications`:** cae con el producto.

## 7. Pendiente: probar en tienda

- [ ] `shopify app deploy` con los permisos nuevos y volver a dar permisos desde Publicar.
- [ ] Instalar el tema y revisar la vista previa: redirecciones, header, pie, Geist, el acento en el botón, 375 px y el editor de temas.
- [ ] Publicar un producto sin variantes. Revisar:
  - que todas las variantes queden sin seguimiento y a la venta (nada de «Agotado»);
  - las variantes de packs, los precios tachados y que la tarjeta cambie el carrito;
  - la galería, los metafields (componentes, reseñas, bajada, oferta) y las políticas y plazos.
- [ ] Publicar de nuevo tras cambiar un componente y verificar que el retirado desaparece.
- [ ] Probar con EasySell instalado: que el app embed siga activo en el tema nuevo.

**No probar en una tienda en producción:** publicar cambia el producto real al instante.
