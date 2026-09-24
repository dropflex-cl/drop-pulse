# Spec: integración con el tema de Shopify (etapa Publicar)

> Estado: **por implementar**. Documento de principios y mecanismos, destilado de dropflex v1, donde esta integración funcionó en producción (kit Flux v1.0 → v1.34).
> Fecha: 2026-09-24.
> Depende de: Textos (bloques aprobados), Imágenes (portada, galería y beneficios elegidos), Reseñas (opcional), Precio y packs, `products.page_accent_color`.
> Fuente v1 (repo hermano `../dropflex`): `lib/integrations/shopify/theme-kit/`, `lib/integrations/shopify/metafields/`, `lib/pdp-layout/`, `lib/shopify/themes/flux/` (tema, `kit.json`, `CHANGELOG.md`, `README.md`), `docs/specs/shopify-theme-deployer.md`, `docs/specs/shopify-landing-metafields.md`.

## 0. Resumen

DropFlex no escribe páginas: **instala un tema propio en la tienda una vez y después solo le manda datos**. La página del producto se arma sola en Shopify a partir de tres canales independientes:

| Canal | Qué lleva | Quién lo escribe | Cuándo cambia |
|---|---|---|---|
| **Tema** (kit Flux) | La estructura: secciones Liquid, estilos, lógica de render | El deployer (instalar / actualizar) | Con cada versión del kit |
| **Metafields del producto** (`dropflex.*`) | El contenido: textos en `json`, imágenes y videos como referencias de archivo, el color | «Publicar» de cada producto | Cada vez que el comerciante publica |
| **Template por producto** (opcional) | El orden y la visibilidad de secciones para ESE producto | El panel «Orden de la página» | Cuando el comerciante reordena |

La regla que sostiene todo: **la estructura vive en el tema, el contenido vive en los metafields, y lo que el comerciante edita en el editor de Shopify nunca se pisa.**

---

## 1. Principios (no negociables)

1. **Estructura y contenido separados.** Una sección Liquid lleva escrito en el código qué metafield lee (`product.metafields.dropflex.<key>`). Lo único que cambia entre productos son los valores. Nunca se usa «Conectar fuente dinámica» del editor: eso guarda el vínculo en el JSON del template, que es del comerciante.
2. **Cada sección se protege sola.** Si su metafield está vacío, no renderiza **nada**: ni markup ni `{% style %}`. Así puede estar en cualquier template, en cualquier producto, desde el primer día.
3. **Frontera de confianza texto/imagen.** El texto de la IA va en un metafield `json` de texto plano; las imágenes van en OTRO metafield (`file_reference` / `list.file_reference`) con GIDs de Shopify que subimos nosotros. El JSON **nunca** lleva una URL ni HTML. El tema escapa cada cadena. La IA devuelve estructura (`{kind:'bullets', items:[…]}`), nunca marcado.
4. **Lo del comerciante es intocable.** `templates/**`, `sections/*.json` (grupos de header/footer) y `config/settings_data.json` los escribe el editor de temas. Una actualización del kit **jamás** los sobrescribe. Solo se toca código: `sections/*.liquid`, `snippets/`, `assets/`, `layout/`, `locales/`, `config/settings_schema.json`. Por defecto se deniega: lo que no se reconoce como código, está protegido.
5. **Instalar nunca publica.** El tema se crea **sin publicar** y se entrega una URL de vista previa. Publicar es un paso aparte y explícito del comerciante.
6. **Todo es idempotente.** Instalar dos veces retoma la instalación; actualizar una tienda al día no escribe nada; publicar un producto dos veces es un upsert por (owner, namespace, key); las definiciones de metafields se crean una vez y los `TAKEN` se ignoran; los archivos subidos se cachean por origen.
7. **Lo que llega por update son defaults de schema, no templates.** Un setting o bloque que el template no menciona toma el `default` de su `{% schema %}`. Para que una mejora llegue a tiendas ya instaladas sin intervención, se diseña como setting o bloque con default, no como un cambio de template.
8. **Shopify rechaza en silencio.** Un archivo inválido no falla la importación: se descarta, y se lleva consigo **todo template que lo referencia**. Por eso cada regla que Shopify aplica al importar se valida en CI antes de publicar el kit (§9).
9. **Una sola fuente de verdad por regla.** Qué página es landing, qué tono sale del acento, qué archivo es actualizable: un solo snippet o una sola función pura con test, y el resto la consulta.
10. **Lo de terceros se trata como no contractual.** El DOM de EasySell, el body de un archivo de tema (TEXT, BASE64 o URL), el comentario `/* … */` que Shopify antepone a un template guardado: se maneja la variante, se degrada sin romper la página.
11. **Multi-tenant.** Nada de una tienda queda escrito en el código del kit: nombre, WhatsApp, correo, logo, horarios. Lo por tienda va en placeholders (solo en archivos protegidos, se resuelven al instalar) o en settings.

---

## 2. Flujo completo

```
Conectar Shopify (OAuth, scopes con temas y archivos)
        │
        ▼
Instalar tema ──► ZIP por tienda ─► bucket privado ─► URL firmada 15 min
        │           themeCreate(source) ─► sondeo hasta processing=false
        │           ─► verificar templates/index.json ─► copiar app embeds
        │           ─► asegurar páginas requeridas ─► registro status=preview
        ▼
Vista previa (?preview_theme_id=…) ──► el comerciante revisa
        │
        ▼
Publicar tema (themePublish) ──► status=published
        │
        ▼                         (por producto, cada vez)
Etapas de IA → aprobado ──► «Publicar» ─► definiciones de metafields (idempotente)
                                       ─► subir imágenes/videos a Files API (caché de GID)
                                       ─► metafieldsSet en lotes de 25
                                       ─► (opcional) template propio + templateSuffix
        │
        ▼
Storefront: sección Liquid lee product.metafields.dropflex.* y renderiza
```

Actualizar el kit después: diff de checksums MD5 contra el tema **vivo** y `themeFilesUpsert` en lotes de 50, solo archivos de código (§4.3).

---

## 3. Conexión y permisos

Hoy `SHOPIFY_SCOPES` (`lib/integrations/shopify/oauth.ts`) = `read_products, write_products, read_inventory, read_orders`. La integración necesita sumar, en `shopify.app.toml`, `shopify.app.dev.toml` y `SHOPIFY_SCOPES` a la vez:

| Scope | Para qué |
|---|---|
| `read_themes`, `write_themes` | Crear, leer, actualizar y publicar el tema; template por producto |
| `write_online_store_pages` | Páginas requeridas (gracias, seguimiento, contacto…) |
| `read_files`, `write_files` | Subir imágenes, GIFs y videos a la Files API |

- `write_products` ya cubre **definir y escribir** metafields de producto (no existe un `write_metafields` aparte).
- Antes de cada acción de tema se revisan los scopes guardados al conectar y se falla temprano con `missing_theme_scopes` (v1: `hasThemeDeployScopes`), en vez de esperar el `ACCESS_DENIED` de Shopify. Tiendas ya conectadas deben volver a dar consentimiento.
- **Accesos a temas para apps públicas:** Shopify exige una solicitud de excepción para `write_themes` en apps distribuidas. Confirmar el estado de la app antes de F1 (§12).

---

## 4. El deployer del tema

Orquestación agnóstica: recibe todo inyectado (`client`, `kit`, `registry`, `artifacts`, `buildArtifact`, `log`). Las server actions autorizan al usuario contra la tienda con RLS y **después** arman las dependencias con `service_role`.

### 4.1 Instalar (`installKitTheme`)

1. **Retomar si ya existe:** si el registro tiene un tema de la misma versión y no `failed` (y no es reimportación forzada), no se crea otro: se reverifica y se devuelve su preview.
2. **Capacidad de la biblioteca:** Shopify admite 20 temas. Si está llena, se borran solo temas **del kit** (`Flux v…`), no publicados y distintos del registrado. Nunca un tema del cliente. Si sigue llena: error accionable.
3. **Construir el ZIP en memoria:** las 7 carpetas del tema en la raíz, placeholders `__SHOP_NAME__`, `__WHATSAPP_NUMBER__`, `__CONTACT_EMAIL__`, `__SUPPORT_HOURS__` reemplazados (escapados para JSON en `.json`), validación de formato (WhatsApp solo dígitos 8–15, correo) y `JSON.parse` de cada `.json` resuelto. Un placeholder sin valor aborta.
4. **Subir a un bucket privado** con clave determinista (`<kit>-<versión>-<storeId>.zip`, reintentos sobrescriben) y URL firmada de 15 minutos. Se borra en `finally`; un cron barre huérfanos de más de 1 hora.
5. `themeCreate(source: signedUrl, name: "Flux v<versión>")`. Guardar registro `installing`.
6. **Sondear** `theme.processing` cada 3 s, máximo 5 minutos.
7. **Verificar `templates/index.json`.** Si no está, Shopify lo rechazó: la instalación queda `failed`.
8. **Copiar app embeds** (EasySell, Loox, pixels) desde el `settings_data.json` del tema publicado: solo bloques `shopify://apps/…`, los que ya existan en el destino mandan. *Best effort*: un fallo se registra y no tumba la instalación.
9. **Asegurar páginas requeridas** por handle (de `kit.json.required_pages`): se crean si faltan; si existen, solo se corrige `templateSuffix`, nunca el cuerpo.
10. Registro → `preview`. Devolver la URL `https://<shop>?preview_theme_id=<id>`.

### 4.2 Publicar (`publishKitTheme`)

`themePublish(id)` solo tras confirmación explícita. Idempotente si ya está `published`.

### 4.3 Actualizar (`updateKitTheme`)

- Leer el kit local con MD5 de los bytes crudos; leer checksums remotos paginados (250).
- `computeUpdatePlan` (puro, con tests): `toUpsert`, `unchanged`, `skippedProtected`, `restored`.
- **Reparación:** un archivo protegido que **falta** en el remoto se sube (un `product.json` ausente pone en 404 todas las fichas). Nunca `settings_data.json` (cambiaría la paleta). Nunca un archivo con placeholder sin resolver. Se informa aparte como `restored`.
- Red de seguridad: si un archivo actualizable trae un placeholder, el kit está mal armado y se aborta.
- **Actualizar es el camino normal para llevar cambios**; reimportar crea un tema nuevo y el comerciante pierde sus ediciones del editor.

### 4.4 Registro y artefactos

Tabla `shopify_theme_installations` (una fila por tienda): `store_id` (único), `shop_domain`, `theme_id`, `kit_version`, `status` (`installing | preview | published | failed`), `updated_at`. Escritura solo `service_role`. Bucket privado `theme-artifacts`. Ambos entran en `deleteProducts`/borrado de tienda según la regla de v2.

### 4.5 Empaquetado en Vercel

El código del tema no entra solo al bundle de la función. `next.config.ts` → `outputFileTracingIncludes` con la ruta que instala/actualiza → `./lib/shopify/themes/flux/theme/**/*`.

### 4.6 Versionado del kit

`kit.json` (nunca va en el ZIP): `name`, `version` (SemVer: MINOR para secciones o settings nuevos, PATCH para fixes de código), `lineage` (qué archivos del tema base se modificaron y por qué), `custom_sections`, `custom_snippets`, `required_pages`. Cada versión va con su entrada en `CHANGELOG.md`, que dice explícitamente qué llega por update y qué **solo en instalación nueva**.

---

## 5. Anatomía de un componente

Un «componente» del catálogo es una **sección** (ancho completo, en el `order` del template) o un **bloque de `main-product`** (en la columna del producto, junto al precio y al botón). Los que responden una duda en el momento de comprar (entrega, reseñas, GIFs, testimonios) van como bloque; los que cuentan (beneficios, cómo funciona, FAQ) como sección. Si existe en los dos lugares, el markup vive **en un snippet compartido** y nunca se activan los dos a la vez.

### 5.1 Las cuatro piezas

| Pieza | Dónde (v2 propuesto) | Qué hace |
|---|---|---|
| Esquema del contenido | `lib/copy/`, `lib/page-images/`… (ya existen) | zod del contenido aprobado |
| Definición del metafield | `lib/integrations/shopify/metafields/definitions.ts` | `namespace`, `key`, `type`, `access.storefront = PUBLIC_READ` |
| Mapeo puro | `lib/integrations/shopify/metafields/mapping.ts` | contenido aprobado + GIDs → `MetafieldsSetInput[]` (con tests) |
| Sección/bloque Liquid | `lib/shopify/themes/flux/theme/sections|snippets/` | lee el metafield, se autoprotege, renderiza |

Sin `PUBLIC_READ`, Liquid no ve el metafield: la sección queda vacía sin error.

### 5.2 Esqueleto de sección

```liquid
{%- comment -%}
  DropFlex · <Nombre>. Lee:
    dropflex.<key>         (json)                 { heading, items:[…] }
    dropflex.<key>_images  (list.file_reference)  opcional, alineada por índice
  No renderiza nada si no hay contenido.
{%- endcomment -%}
{%- liquid
  assign data = product.metafields.dropflex.<key>.value
  assign images = product.metafields.dropflex.<key>_images.value
  assign df_render = false
  if data != blank
    assign df_render = true
  endif
-%}
{%- if df_render -%}
  {%- style -%}
    /* con alcance #shopify-section-{{ section.id }}; colores solo con tokens del esquema */
  {%- endstyle -%}
  <div class="color-{{ section.settings.color_scheme }} gradient">
    <h2>{{ data.heading | default: section.settings.heading | escape }}</h2>
    {%- for item in data.items -%}
      {%- comment -%} recorrer la lista y emparejar por índice: slice degrada una lista de metafields a texto {%- endcomment -%}
      {%- for img in images -%}{%- if forloop.index0 == forloop.parentloop.index0 -%}
        {{ img | image_url: width: 900 | image_tag: loading: 'lazy', widths: '375, 750, 900' }}
      {%- endif -%}{%- endfor -%}
      <p>{{ item.body | escape }}</p>
    {%- endfor -%}
  </div>
{%- endif -%}
{% schema %}
{
  "name": "DropFlex · <Nombre>",
  "tag": "section",
  "class": "section",
  "disabled_on": { "groups": ["header", "footer"] },
  "settings": [
    { "type": "paragraph", "content": "El contenido sale del metafield dropflex.<key>, generado por DropFlex." },
    { "type": "text", "id": "heading", "label": "Título de respaldo" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Esquema de color", "default": "scheme-1" }
  ],
  "presets": [{ "name": "DropFlex · <Nombre>" }]
}
{% endschema %}
```

Reglas del schema (cada una tumbó el catálogo entero al menos una vez en v1):

- `name` de sección, preset y bloque: **máximo 25 caracteres** (salvo claves `t:`).
- **Nunca `"default": ""`**. «Opcional, parte vacío» se expresa omitiendo `default`.
- `richtext`: el valor empieza con `<p>`, `<ul>`, `<ol>` o `<h1>`–`<h6>`.
- Respetar `enabled_on` / `disabled_on` del template donde se coloca.
- Todo `type` referenciado por un template tiene su `sections/<type>.liquid`.
- `assets/` sin subcarpetas.
- `width` y `height` en toda `<img>` sin `{% if %}` (Theme Check `ImgWidthAndHeight`).
- GIF/WebP animado: **sin** `width` en `image_url` (Shopify recodifica y deja un solo cuadro).
- Textos del comerciante en español neutro; `escape` en cada cadena del metafield.

### 5.3 Colocación en el template

| Caso | Mecanismo |
|---|---|
| Instalación nueva | La sección va en `templates/product.json` en su lugar del embudo. Se autoprotege, así que puede venir encendida. |
| Tienda ya instalada, **bloque** | Diseñarlo como setting o bloque con default en una sección existente → llega por update (principio 7). |
| Tienda ya instalada, **sección nueva** | Patch idempotente al publicar (§5.4) o template por producto (§5.5). Nunca por update automático. |

### 5.4 Patch idempotente de template (pendiente en v1, hacerlo en v2)

Cuando el comerciante publica un producto y el template que usa no tiene una sección del catálogo: leer el template (quitar el comentario `/* … */`), insertar la sección en su posición canónica solo si su `type` no está, escribir con `themeFilesUpsert`. Lo dispara el comerciante, es idempotente y solo agrega algo que se autoprotege. Vuelve a leer antes de escribir para no pisar ediciones del editor.

### 5.5 Template por producto (orden de la página)

Reordenar `templates/product.json` reordena toda la tienda. Por eso el orden de UN producto se publica como `templates/product.dropflex-<id>.json` y se asigna con `productUpdate(templateSuffix)`. Solo se mueven `order`, `block_order` y `disabled`; el resto viaja intacto. Orden de escrituras: primero el archivo, después la asignación. Se resuelve el template igual que Shopify (sufijo → `.json`; si existe `.liquid` legado no se puede reordenar; si no, `product.json`). Si el conjunto de secciones cambió desde que se abrió el panel → `stale`. `main-product` y `buy_buttons` (formulario COD) no se pueden ocultar.

---

## 6. Mapeo v2 → metafields

Namespace `dropflex` (de comerciante, no `$app:`; ver §12). Un `json` por bloque de texto, un metafield de archivos aparte.

| Origen v2 | Metafield | Tipo | Render |
|---|---|---|---|
| `offer_line` + precio y packs | `dropflex.offer` | `json` | Bloque `price` de `main-product` |
| `benefit` (3–5, con `kind`) | `dropflex.benefits` | `json` | Sección beneficios |
| Imágenes slot `benefit` (3:4, una por beneficio) | `dropflex.benefits_images` | `list.file_reference` | Alineadas por índice |
| `how_it_works` | `dropflex.how_it_works` | `json` | Sección |
| `faq` (3–6) | `dropflex.faq` | `json` | Sección + FAQPage JSON-LD |
| `shipping_payment`, `guarantee` | `dropflex.shipping_payment`, `dropflex.guarantee` | `json` | Bloques de la columna / pestañas |
| `product_reviews` aprobadas | `dropflex.reviews` + `dropflex.reviews_images` | `json` + `list.file_reference` | Bloque reseñas (tarjeta con `imageFrom`/`imageCount`) |
| `products.page_accent_color` | `dropflex.accent` | `color` | §7 |
| `title`, `short_description` | campos nativos (`title`, `descriptionHtml`) | — | Tema base |
| `seo_title`, `seo_description` | `seo { title description }` | — | `<head>` |
| Portada y galería | medios del producto (`productCreateMedia` / reordenar) | — | Galería del tema |

Detalles de `metafieldsSet`: máximo 25 por llamada (lotes); el valor de un `list.file_reference` es un **array JSON serializado** de GIDs; el de `file_reference` es el GID solo.

**Borrar también publica.** Si el comerciante rechaza todo lo que ya estaba publicado (testimonios, acento), el metafield debe quedar vacío o borrarse (`metafieldsDelete`). En v1, quitar el acento no borraba el metafield y el color viejo seguía en la tienda: no repetirlo.

**Archivos:** `stagedUploadsCreate` → subida → `fileCreate` → esperar `READY` → GID. Cachear el GID por archivo de origen en una tabla propia (no en una tabla de solo agregar), para no subir dos veces. Los videos pueden quedar en `PROCESSING`: la sección degrada con póster.

**Decisión a tomar con Textos:** `docs/spec-textos.md` regla 1 dice que Publicar arma el HTML de la descripción con una plantilla. Con el tema instalado, los bloques van por metafields y la descripción nativa queda como respaldo (tiendas sin el kit, Google). Ver §12.

---

## 7. Color de acento

### 7.1 Origen

v2 ya lo tiene: `products.page_accent_color` (`#rrggbb`), elegido de `ACCENT_PALETTE` (18 colores, todos AA con texto blanco, `lib/copy/accent.ts`) o a mano. Se publica en `dropflex.accent` (`color`, en minúsculas y validado). Sin valor → se borra el metafield → la página usa el color de botón del esquema.

### 7.2 Cómo lo usa el tema

- `layout/theme.liquid` pone `body.dropflex-accent` solo en fichas de producto con acento.
- Un snippet (`dropflex-accent`) recorre `settings.color_schemes` y clasifica cada esquema por saturación y brillo del fondo:
  - **Neutro:** el acento solo en `--color-button`, `--color-button-text` y `--color-link`, y solo dentro de `#MainContent` (header y footer mantienen la marca de la tienda).
  - **Bloque de color oscuro** (marquee, barra de anuncios): fondo = acento a L22, texto blanco, botones a L80, en toda la página.
  - **Bloque de color claro** (banner de oferta): fondo = acento a L95, texto a L22, en toda la página.
- Los tonos se derivan con `color_modify: 'lightness', N`, que conserva el tono.
- Los tokens `--flux-accent*` se definen a partir de `--color-button`, así que heredan el acento solos.
- **Precio:** `--df-price-ink` es el acento bajado (o subido en fondo oscuro) por una escalera de luminosidad hasta pasar **4.5:1 contra el fondo de ese esquema**. Sin acento, vuelve al verde de confianza.
- **Colores de significado fijos:** tachado siempre rojo (`--flux-deal`), estrellas ámbar, urgencia naranja. Sobreviven a cualquier acento.
- **Apps con estilos inline (EasySell):** el CSS no alcanza (`!important` inline). Un script repinta sus superficies por clase, leyendo qué descendientes tienen `color` inline, con un MutationObserver idempotente (lee antes de escribir para no reentrar). Si el nodo no existe, el botón queda con los colores de la app y sigue funcionando.

### 7.3 Mejora sobre v1

En v1 la escalera de contraste está escrita **cuatro veces** con umbrales distintos (precio, CTA, notificaciones, logo). En v2: un solo snippet (`dropflex-accent-tokens`) que emite todos los tonos derivados como variables CSS (`--df-accent`, `--df-accent-ink-on-white`, `--df-accent-on`, `--df-accent-tint`, `--df-accent-shade`…), y los demás solo los consumen. Un cambio de contraste, un solo lugar.

---

## 8. Logo y marca

**Lección de v1:** en v1.34 el header dejó de usar `settings.logo` y dibuja un SVG fijo (una marca con wordmark y «PRODUCTOS VIRALES» convertidos a trazados) teñido con el acento. Como era código, llegó por update a **todas** las tiendas instaladas y reemplazó su logo. Viola el principio 11.

Mecanismo para v2:

- El header renderiza `settings.logo` del comerciante (con `image_url` y `logo_width`). Esa es la regla.
- Un logo teñible es **opcional**: setting `brand_logo_mode` (`upload` por defecto | `tinted`). En modo `tinted`, el comerciante sube un **SVG monocromo** o la app le genera uno, y el tema lo pinta con `currentColor` = acento del producto.
- Fuera de fichas con acento, el logo usa el color de la paleta de la tienda, no un rosa fijo: cambiar de tono entre la ficha y el carrito se lee como otra tienda.
- En modo landing el logo va en un `<span>` sin enlace a la home.
- `logo_width` se define en un solo valor coherente entre `settings_schema.json` (default), `settings_data.json` (`current`) y el preset, con un test que los ate (en v1 eran 100 / 140 / 70).

---

## 9. Modo landing y embudo de un producto

Dos mecanismos distintos, con una sola fuente de verdad cada uno.

### 9.1 Modo landing (quitar salidas)

Snippet `dropflex-focus-mode` devuelve `true`/`false`; los consumidores lo capturan y lo normalizan a booleano (en Liquid toda cadena es verdadera). Settings: `pdp_focus_mode` (encendido por defecto) y `focus_mode_scope` (`funnel`: producto y contacto; `store`: todas las páginas). Apaga menú, buscador, cuenta, barra de anuncios, migas, relacionados, menús del pie, «powered by» y el ícono del carrito; el logo queda sin enlace; aparece un solo enlace de contacto.

### 9.2 Redirección al último producto

Snippet en `<head>`, antes de estilos (sin parpadeo):

- En una ficha: `localStorage['df:last-product'] = product.url` y se rearma el fusible.
- En una página fuera de la lista permitida: `location.replace` al último producto; si no hay, al destino en frío (producto fijo, o primer producto **disponible** de una colección; resuelto en el servidor).
- En 404: borra el valor guardado y rebota al destino en frío **una vez por sesión** (fusible `sessionStorage['df:bounced']`), para no crear un bucle si todas las fichas dan 404.
- Nunca redirige: producto, carrito, políticas, cuenta, password, gift card, captcha, páginas `contact`, `seguimiento` y **`gracias`** (ahí vive la confirmación y el píxel de compra), ni en el editor (`Shopify.designMode`). Solo rutas del mismo origen.

Correcciones que v2 debe traer desde el inicio:

1. **Conservar `location.search`** (`utm_*`, `fbclid`, `gclid`) al redirigir: el redirect ocurre antes de cualquier píxel y en v1 se perdía la atribución de Meta.
2. **Guardar la disponibilidad** junto a la URL y no volver a una ficha agotada.
3. Lista permitida por **handle o tipo**, no solo por sufijo de template: una página de contacto o de términos con otro template no debe redirigir.
4. **Activación desde la app:** en v1 venía apagado y la app no podía encenderlo (`settings_data.json` es del comerciante). En v2, un interruptor en la app que aplica un **patch idempotente solo de esas claves** en `current` de `settings_data.json` (el mismo patrón que la copia de app embeds: lo dispara el comerciante, fusiona, no pisa el resto). Nunca cambiando el default del schema: eso convierte en embudo, sin aviso, toda tienda que nunca guardó el valor.
5. `localStorage` es por origen: `*.myshopify.com` y el dominio propio no comparten el último producto. Documentarlo en la UI.

---

## 10. Errores conocidos de v1 y su protección

| Problema | Causa | Solución / protección en v2 |
|---|---|---|
| Todas las fichas en 404 | `name` de schema de 32 caracteres | Validador: tope 25 (§5.2) |
| Todas las fichas en 404 | `"default": ""` en un setting | Validador: sin defaults vacíos |
| Todas las fichas en 404 | Template referencia una sección inexistente | Validador: `sections/<type>.liquid` existe |
| Home en 404 tras instalar | Template rechazado al importar | `assertHomeTemplateInstalled` → `failed` |
| Template perdido para siempre | Updates no tocan templates | Reparación de huecos (`restored`) |
| COD «desactivado» tras reinstalar | App embeds viven por tema en `settings_data` | Copia de bloques `shopify://apps/…` |
| Copia de app embeds apagada sin aviso | Body de archivo solo leído como TEXT | Manejar TEXT, BASE64 y URL |
| Secciones duplicadas | Fallback que inyectaba secciones desde `layout` además del template | Una sola vía de colocación (§5.3) |
| «invalid url input» | `slice` sobre una lista de metafields | Recorrer y filtrar por índice |
| CSS muerto de 3–8 KB por sección | `{% style %}` fuera de la guarda | `df_render` envuelve CSS y markup |
| GIF quieto | `width` en `image_url` recodifica | Sin `width` para animaciones |
| Tema rechazado | Subcarpetas en `assets/` | Assets en la raíz |
| WhatsApp roto en todas las tiendas | `url_encode` sobre la URL completa | Codificar solo el mensaje |
| Bucle de redirección | 404 → fallback → 404 | Fusible de sesión |
| Override CSS que no gana | Hojas de Sense cargan después de `flux-redesign.css` | Subir especificidad, no empatar |
| CTA de EasySell con su color de fábrica | Estilos inline `!important` | Repintado por script idempotente |
| Tema sin código en producción | Carpeta del tema fuera del bundle | `outputFileTracingIncludes` |
| Biblioteca llena | Límite de 20 temas | Borrar solo temas del kit sin publicar |
| Logo del comerciante reemplazado | SVG fijo en el header | §8 |
| Documentación desfasada | Specs que describían mecanismos ya eliminados | Actualizar spec en el mismo cambio (§11) |

**CI obligatorio** (v1: `template-rules.ts` + `template-rules.test.ts`, que recorren el tema del repo): `findSectionSchemaIssues` sobre cada sección y `findTemplateIssues` sobre cada template JSON. Además `shopify theme check` en 0 errores y un test que ate `kit.json.version` con la última entrada del CHANGELOG.

---

## 11. Checklist para agregar un componente

1. Esquema zod del contenido, en el módulo de su etapa. La IA devuelve estructura, nunca HTML ni URLs.
2. Definición en `definitions.ts` con `PUBLIC_READ`. Texto `json`; archivos en su propio metafield.
3. Función pura en `mapping.ts` + test. Decidir qué pasa con la lista vacía: ¿no se escribe, o se escribe vacía para bajar lo publicado?
4. Carga de lo **aprobado** y su inclusión en el push. Archivos por Files API con caché de GID.
5. Sección o bloque Liquid con el esqueleto de §5.2: guarda `df_render`, `escape`, tokens del esquema, schema válido.
6. Si existe como bloque y como sección: snippet compartido, y documentar «nunca los dos a la vez».
7. Colocación: template para instalaciones nuevas; bloque con default o patch idempotente para las instaladas.
8. Si toma el acento: solo consume los tokens de `dropflex-accent-tokens`.
9. Validador y Theme Check en verde.
10. `kit.json`: subir versión, `custom_sections`/`custom_snippets`, `lineage` si se tocó un archivo del tema base. Entrada en `CHANGELOG.md` que diga qué llega por update y qué solo en instalación nueva.
11. Borrado: toda tabla o archivo nuevo ligado al producto entra en `deleteProducts` (regla de v2).
12. Actualizar este spec y `CLAUDE.md` en el mismo cambio.

---

## 12. Decisiones abiertas

1. **Kit en v2:** ¿se porta Flux (Sense 15.4.1) desde v1 tal cual, o se parte de un tema base nuevo con estos mismos contratos? Portar es más rápido; los contratos de §5 no dependen del tema base.
2. **Namespace:** `dropflex` (de comerciante, editable en el admin, como en v1) o `$app:dropflex` (reservado a la app, no editable por el comerciante). `$app` evita ediciones accidentales pero ata los datos a la instalación de la app.
3. **Descripción nativa:** plantilla HTML en `descriptionHtml` como respaldo (spec Textos) además de los metafields, o solo metafields.
4. **Permiso `write_themes`:** estado de la excepción de Shopify para la app.
5. **Migraciones de template** (`kit.json.migrations`): en v1 quedaron diseñadas y fuera de alcance. §5.4 cubre el caso principal; decidir si hace falta el mecanismo general.

---

## 13. Plan de fases

- **F0 — Kit en el repo:** tema, `kit.json`, `CHANGELOG.md`, validador de schema y templates en CI, `shopify theme check` en 0.
- **F1 — Scopes y registro:** scopes nuevos en las 3 fuentes, re-consentimiento, tabla `shopify_theme_installations`, bucket `theme-artifacts`, `outputFileTracingIncludes`.
- **F2 — Instalar / previsualizar / publicar tema:** deployer (§4.1–4.2) con tests de las partes puras; paso en el onboarding o en Ajustes › Conexiones.
- **F3 — Actualizar tema:** `computeUpdatePlan` con reparación de huecos; botón «Actualizar tema» y cron opcional.
- **F4 — Publicar producto (texto):** definiciones, mapeo, `metafieldsSet`, borrado de lo rechazado, acento.
- **F5 — Publicar producto (archivos):** Files API, caché de GID, imágenes de beneficios, reseñas, videos.
- **F6 — Colocación en tiendas instaladas:** patch idempotente (§5.4) y panel de orden (§5.5).
- **F7 — Embudo:** modo landing y redirección con las correcciones de §9.2, activables desde la app.
- **F8 — QA en tienda real:** render con `PUBLIC_READ`, claro/oscuro, 375 px, acentos extremos (amarillo pálido, negro), app embeds tras reinstalar, reparación de `product.json` borrado a mano.
