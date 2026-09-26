# Etapa Imágenes: las imágenes de la página del producto

La etapa Imágenes prepara lo visual de la página del producto (PDP) con nivel de agencia: una galería que se ve como la de una marca premium, generada desde la foto real del producto. Se organiza **por espacios de la página** (design-system `imagenes.md`). **Va antes de la Página del producto** (cambio del 2026-09-24): la página usa estas imágenes en la ficha y en sus componentes. Además de las imágenes, el comerciante **sube sus GIF** (§1bis); el video UGC queda para después (§7).

## 1. Espacios

| Espacio | Formato | Obligatorio | De dónde sale |
|---|---|---|---|
| Portada | 1:1 | Sí | Una toma `hero_clean` o `hero_mood`, sin textos |
| Galería | 1:1, se eligen 4 a 6 y se ordenan | Sí (mínimo 4) | 5 tomas distintas: ambiente, infografía, comparativa, qué incluye (o detalle) y una de uso, escala o detalle |
| Beneficio N | **3:4** | No | 3 tomas, una por cada beneficio que el director propone desde la ficha y los ángulos (`benefit-1…3`, `BENEFIT_SHOTS`) |
| GIFs | animado, hasta 5 ordenados | No | Solo **subidos** por el comerciante (`gifs`, `GIF_MAX`); nunca generados (§1bis) |

- La etapa se habilita con los 2 desarrollos de Ángulos aprobados y queda lista con portada y al menos 4 de galería (`lib/products/stages.ts › imagesStage`). Si cambian los desarrollos, la galería queda desactualizada. La Página del producto se habilita recién con las imágenes listas.
- **Por qué 3:4 y no 4:5:** Flare acepta 1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16 y 21:9 (medido: `4:5` responde 400). En el POC, recortar un 3:4 a 4:5 cortó un titular. 3:4 nativo se ve casi igual en la página y no se corta nada.
- Cada espacio junta opciones de tres orígenes: **IA** (generadas), **Tu foto** (las en uso de Información base, sin copiarlas) y **Subida** (JPG, PNG o WebP de hasta 15 MB y al menos 600 px por lado).

## 1bis. GIFs

El espacio `gifs` alimenta el componente **`gif-strip`** («DropFlex · GIFs», bajo el botón de compra). La Página del producto escribe **5 textos** para él en la misma llamada que el resto de la página (título arriba del GIF, párrafo o lista abajo), **el más fuerte primero**. El GIF N lleva el texto N: con 3 GIF subidos se usan los 3 primeros textos; sin GIF, la tienda no muestra el bloque. La IA no ve los GIF: si un texto no calza, se reordenan los GIF aquí o se edita el texto en la Página del producto.

- **Se agregan con el mismo `ImageUploader` de Información base** («Desde tu equipo» / «Desde un enlace»), con sus textos y tipos ajustados por props. Desde el equipo, por URL firmada (`preparePageUpload` con `slot: "gifs"`), varios a la vez y en el orden elegido. Desde un enlace, `POST /page-images/url` → `importPageGif`, que descarga con la misma función que las referencias (`download` de `lib/products/images.ts`: solo sitios públicos, redirecciones revisadas, nunca una página HTML, lectura con tope). GIF, WebP animado o APNG de hasta 25 MB. Las dos entradas terminan en `storeGif`. El bucket `page-media` acepta `image/gif` y `image/apng` desde la migración `20261011000000_page_gifs.sql`.
- **Se guarda como WebP animado** (`confirmGifUpload`): sharp con `animated: true` al leer y al escribir (sin eso entrega el primer cuadro, sin error), ancho máximo 900 px (una animación decodificada es una tira vertical de cuadros: el tope es de ancho), calidad 72. El original se borra. Pesa de 5 a 10 veces menos que el GIF.
- **Un archivo de un solo cuadro se rechaza** («Ese archivo no se mueve»), y también uno de menos de 240 px por lado. La comprobación es después de decodificar: la cabecera no prueba que algo se mueva.
- Entra **ya elegido**, al final de la fila (`position`). Se reordena con las flechas (`PUT /page-images/order` con `slot`), se quita y se descarta como cualquier opción (Deshacer, borrado a los 2 minutos).
- No entra en el catálogo de fotos de los componentes (`lib/copy/images.ts`) ni en la galería: solo en `gif-strip`. Publicar lo sube a Shopify Files como imagen y lo escribe en `dropflex.gif_strip_media` (`list.file_reference`); el Liquid usa `image_url` **sin `width`**, porque una variante transformada conserva un solo cuadro.

## 2. Flujo

1. **Generar la galería** (`POST /api/products/[id]/page-images`). Se muestra el costo antes: lo que se genera solo, la portada y 4 de galería (`AUTO_SHOTS` = 5 imágenes × el costo del proveedor). Crea una corrida del director (`page_image_runs`) y sigue en `after()`.
2. **Director de galería** (Claude, `lib/page-images/prompts.ts`). Recibe la foto base y las otras imágenes en uso, la ficha, el cliente ideal, los 2 desarrollos de ángulo y los textos aprobados (nombre corto, cómo funciona y beneficios). Entrega:
   - lo común: `product_look`, `kit`, `brand_art`, `props_allowed` y `props_forbidden`;
   - una toma por espacio (`page_image_shots`): tipo, escena, layout, arte, unidades, partes del kit, manos y textos con su ubicación.
   `planProblems` la valida en código y se reintenta hasta 3 veces con lo que falló.
3. **Render**: solo las tomas que van solas (`autoShotIds`: la portada y las primeras 4 de galería, lo que deja la etapa lista), de a 4 en paralelo (`lib/page-images/render.ts`). Flare, 1k, `low`, directo (sin preset) y sin `enhance_prompt`, con la foto base como referencia. La quinta de galería y los beneficios quedan **propuestos, sin generar**: el comerciante los genera si los quiere («Generar» en la toma o «Generar los beneficios»). En prod (2026-09-24/25) la quinta sobró en las 2 galerías vigentes y los beneficios se usaron en 1 de 2 productos.
4. **QA** (Claude con visión): producto idéntico, textos exactos, sin textos extra (incluido el texto de la caja impreso en el producto), props engañosos, unidades idénticas y anatomía. Si falla, **un reintento automático** de la misma toma (`retry_of`). Si el reintento sale bien, el primer intento se descarta solo, salvo que el comerciante ya lo haya elegido.
5. **Elegir**:
   - Portada y beneficios llevan una sola imagen: elegir otra reemplaza la anterior.
   - La galería lleva de 4 a 6 y se ordena (1 = la primera después de la portada).
   - «Generar» hace la primera imagen de una toma propuesta; «Generar otra», una más de la misma toma. «Generar los vacíos» (`POST /page-images/fill`) genera las tomas que van solas y quedaron sin imagen viva (una falla): nunca las opcionales, que no bloquean «Continuar». «Generar los beneficios» (`{ scope: "benefits" }`) genera los beneficios sin imagen. «Proponer otra galería» vuelve a correr el director.
6. Lo que no alcanza a terminar en `after()` lo termina el sondeo de la pantalla (`syncPageImages`, lease de 20 s), igual que Creativos. Una imagen que falló después de llegar a Higgsfield se puede **recuperar** sin volver a pagar.

## 3. Datos

Migración `20261007000000_page_images.sql`:

- `page_image_runs`: la corrida del director. En `input` van el mercado, el cliente ideal, los desarrollos y los textos usados, incluidos los beneficios con su id. Con eso la pantalla avisa si los beneficios cambiaron (`stale`).
- `page_image_shots`: una toma por espacio. `payload` es la toma más lo común de la corrida (`StoredShot`).
- `page_images`: cada opción.
  - `source`: `ai` | `upload` | `reference`.
  - `render_status`: estado de la generación.
  - `status approved`: la opción está elegida.
  - `position`: el orden en la galería.
- Bucket privado `page-media` (generadas y subidas). Las fotos de Información base se muestran desde `product-references`.

### Qué se borra

- **Descartar:** borra archivo y fila pasados 2 minutos (el plazo de Deshacer). Una foto de Información base solo se quita del espacio.
- **Proponer otra galería:** borra todas las imágenes generadas de las tomas anteriores, **también las elegidas**, y después las tomas que quedan vacías. Las que se estén generando se borran al terminar. Las subidas y las fotos se quedan.
- **Orden de borrado:** primero Storage y después la base (`purgeDiscardedPageImages`).
- **Producto eliminado en Shopify:** `lib/products/delete.ts` borra además todo `page-media/<user>/<product>/`.

## 4. Dirección de arte (lo que hace que se vea de agencia)

La dirección de arte se validó en un POC con datos de prod de solo lectura (removedor de callos) y con URO, en 3 rondas:

- **Ronda 1** («minimal, clinical, breathing room»): salían imágenes de catálogo, con el producto chico, tipografía fina y fondos crema. El QA aprobó 18 de 20, pero el nivel era bajo.
- **Ronda 2**: dirección de **campaña editorial**. El nivel quedó comparable al hero de F0 de URO.
  - El producto ocupa 50 a 70% del alto, con cámara baja y luz de contorno.
  - Hay un elemento en movimiento (salpicadura, cápsulas flotando, tela en el aire) y un prop desenfocado en primer plano.
  - La paleta es monocromática y sale del color del producto, con un acento profundo para los textos.
  - El titular es grueso y dominante, y los badges son píldoras sólidas con ícono.
  - **Con y sin preset salió igual**, así que no se usan presets.
- **Ronda 3** (el removedor): el estilo funciona en otro tipo de producto. Además aparecieron problemas que ahora corrigen reglas en código:
  - titulares en minúscula;
  - ofertas en la imagen («dos de regalo»);
  - texto de la caja impreso en el producto;
  - unidades de distinto tamaño;
  - props que parecen incluidos (un power bank rosado);
  - «piedras» que el modelo volvía cristales.

**Reglas de props:** se permite todo lo que dé ambiente sin prometer nada. Se prohíbe lo que sugiera un ingrediente, sabor, función o accesorio que la ficha no dice, por ejemplo frutas junto a un suplemento sin fruta. Cada prop se describe con precisión visual.

**Reglas de texto:**
- Sin precios, descuentos, packs ni regalos: la página ya los muestra y cambian.
- Solo datos de la ficha o de los ángulos (los beneficios los propone el director, con un dato de la ficha que los sostiene; `planProblems` revisa cantidad, largo y que no haya precios).
- Titular de 2 a 6 palabras con mayúscula inicial.
- Límites por rol iguales a Creativos.

## 5. Costo

- Director: ~US$0,25.
- Imagen de Flare: se registra con la cota de US$0,10, marcada como estimada.
- QA: ~US$0,04 por imagen.
- **Generar la galería** (portada y 4 de galería, 5 imágenes): ~US$0,50 de Higgsfield + ~US$0,40 de Claude (director y QA). Cada toma opcional que se pide suma una imagen y su QA.
- Topes por comerciante en 24 h: 10 galerías, 150 imágenes y 12 opciones generadas por espacio.
- Los pasos `page_plan`, `page_render` y `page_qa` suman a la etapa Imágenes del costo de IA del producto.

## 6. Pantalla

`/products/[id]/images` (`components/screens/page-images.tsx`):

- **Móvil:** vista general por espacios, agrupados en Galería y Por qué comprarlo. Cada espacio muestra su estado (vacío, generando, N opciones, elegida o con error). Al tocarlo se abre el espacio (`?espacio=`), con el texto que acompaña, las elegidas en orden, las opciones con su origen y su QA, «Generar otra» por toma, «Tus fotos» y «Subir imagen».
- **Escritorio:** los espacios a la izquierda y el espacio elegido al centro.
- **Sin Higgsfield o sin ángulos aprobados:** se puede elegir fotos y subir, pero no generar.
- **«Continuar: Página del producto»:** con las imágenes listas, empieza a escribir la página y lleva a ella.

## 7. Pendiente

- Video UGC (Higgsfield, 9:16) y la guardia de honestidad.
- «Cómo funciona» en 16:9. Flare lo soporta nativo; falta una toma para ese espacio.
- Llevar lo elegido a Shopify (etapa Publicar).
- Tercera columna de escritorio con el generador (`GenerationComposer`): hoy el director decide la toma y el comerciante solo pide otra.
