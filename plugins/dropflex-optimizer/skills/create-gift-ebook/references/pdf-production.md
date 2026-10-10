# Producción editorial del ebook

El chat dirige, escribe y crea los assets. DropFlex aporta hechos, estrategia y la referencia real. El helper compone archivos locales, infiere la paleta desde esa referencia y respeta el orden editorial; no genera imágenes por su cuenta, publica ni configura la entrega con los pedidos.

## Dirección visual y assets

Inspecciona primero la referencia real. Selecciona una región que cubra el producto o su envase, evitando fondos que puedan sesgar la paleta. Ejecuta:

```sh
python scripts/build_ebook.py --inspect-reference assets/product-base.webp --subject-region 0.12 0.10 0.88 0.90
```

El helper devuelve un acento inferido y su región. Prefiere colores del sujeto suficientemente representados; filtra blancos y negros de fondo y trabaja tonos neutros cuando el producto es neutro. La región usa coordenadas normalizadas [izquierda, arriba, derecha, abajo]. Comprueba visualmente que el tono corresponde al producto; ajusta la región si incluyó un fondo, una mano u otro objeto. No copies el acento informado por DropFlex ni fuerces un color de categoría.

Define una dirección común: paleta inferida, fondos, iluminación, sombras, textura y tratamiento minimalista. Usa esa dirección tanto en todos los prompts como en el PDF. Conserva una imagen protagonista propia de portada y escenas/detalles diferentes para el interior. Cada una debe enseñar algo o apoyar una acción de la guía.

Diseña infografías originales con la información del producto, el objetivo del lector y la acción que quieres explicar. Una rutina de skincare, por ejemplo, se ilustra con pasos y uso confirmado; una guía de organización puede mostrar zonas, agrupaciones o un cierre del día. La forma visual se elige para esa explicación, no de un catálogo fijo de cajas. Puedes crear diagramas sencillos como vectores propios y rasterizarlos para el helper.

Para imágenes e infografías ilustradas usa el generador disponible. Cada llamada que represente el producto lleva su referencia real adjunta; una segunda imagen aprobada puede servir como referencia de estilo, sin sustituir la base. Conserva la identidad: silueta, proporciones, piezas, materiales y detalles confirmados. No inventes funciones, componentes incluidos ni resultados. Inspecciona cada asset antes de maquetar.

Un prompt útil contiene: papel de las imágenes de entrada, propósito de la pieza, contenido exacto, composición, dirección compartida, paleta inferida y elementos que deben conservarse. Guarda el prompt completo con el asset. Si tiene rótulos, pásalos literalmente al generador y revisa su escritura. Los textos educativos importantes también deben estar en bloques seleccionables del PDF.

## Manuscrito 2.0

El contrato anterior de posiciones fijas se reemplaza por bloques ordenados. Para actualizar un ebook anterior, recupera su contenido útil, referencia y assets; crea las piezas faltantes y transforma cada sección en `blocks` según su propósito. No mantengas automáticamente la secuencia de la versión anterior.

Ejemplo abreviado de estructura, no plantilla editorial para todos los productos:

```json
{
  "schema_version": "2.0",
  "title": "Tu espacio, listo para empezar",
  "subtitle": "Una guía práctica para organizar lo que usas a diario",
  "product_name": "Nombre confirmado del producto",
  "product_reference": {
    "id": "ID de la referencia canónica",
    "path": "assets/product-base.webp",
    "subject_region": [0.12, 0.10, 0.88, 0.90]
  },
  "visual_direction": {
    "style": "Minimalismo editorial, luz suave, materiales fieles y sombras discretas",
    "palette_basis": "Colores del producto y su envase, aislados del fondo"
  },
  "background": "plain",
  "show_contents": false,
  "cover": {"asset": "cover-scene", "layout": "image_first"},
  "visual_assets": [
    {
      "id": "cover-scene",
      "kind": "product_image",
      "path": "assets/cover.png",
      "contains_product": true,
      "source": "generated_from_reference",
      "reference_id": "ID de la referencia canónica",
      "purpose": "Protagonizar la promesa editorial",
      "prompt": "Prompt completo utilizado con la referencia adjunta"
    },
    {
      "id": "usage-map",
      "kind": "infographic",
      "path": "assets/usage-map.png",
      "contains_product": true,
      "source": "generated_from_reference",
      "reference_id": "ID de la referencia canónica",
      "purpose": "Explicar una acción aplicable con una composición distinta",
      "prompt": "Prompt completo de la infografía propia"
    }
  ],
  "chapters": [
    {
      "title": "Empieza por lo que sí usas",
      "blocks": [
        {"kind": "paragraph", "text": "Una acción concreta y por qué ayuda."},
        {
          "kind": "infographic", "asset": "usage-map", "layout": "wide", "size": "large",
          "caption": "Qué explica esta pieza y cómo aplicarlo."
        },
        {"kind": "callout", "title": "Pruébalo hoy", "body": "Una tarea pequeña."}
      ]
    }
  ],
  "context": {
    "product_id": "ID del producto",
    "angle": "Argumento elegido",
    "reader": "Quién compra",
    "editorial_promise": "Qué podrá aplicar al terminar"
  },
  "landing_gift": {
    "headline": "Una guía práctica de regalo",
    "body": "Su utilidad concreta. Incluida gratis con cada compra.",
    "delivery_note": "Mecanismo real o pendiente de conectar"
  }
}

```


`brand`, `context`, `landing_gift` y `sources` son opcionales. Las claves van en inglés; el contenido usa el idioma del mercado. Las rutas son locales, relativas al manuscrito o absolutas. El helper no descarga URLs ni recibe `accent_color`: lo calcula desde `product_reference`.

Cada asset tiene ID único, PNG/JPEG/WebP legible, propósito, tipo y procedencia. `kind` es `product_image`, `infographic` o `illustration`. `source` es `generated_from_reference`, `generated`, `authored_vector` o `approved_gallery`. Las piezas creadas guardan su prompt; todas las que contengan el producto guardan el ID de la referencia utilizada. El helper comprueba esa trazabilidad declarada; la inspección contra la foto base comprueba la fidelidad real.

La portada requiere un asset propio creado desde la referencia del producto. El interior utiliza una escena/detalle diferente, comprobado también por hash del archivo, y al menos una infografía propia. Una infografía puede contener el producto y cumplir ambos fines. No copies la misma imagen bajo dos nombres. Assets de galería aprobados pueden complementar la guía si son coherentes con su dirección.

## Composición variable

`cover.layout` acepta `image_first` o `title_first`. Siempre hay portada dedicada, medida para no dividirse ni reducir la tipografía a un tamaño ilegible.

`show_contents` es opcional y por defecto false: decide si la guía se beneficia de un índice. Los bookmarks existen con o sin índice. `chapters[].start_on_new_page` es opcional y por defecto false: las secciones pueden continuar en la misma página. No impongas un número de capítulos o páginas.

El orden de `blocks` es el orden exacto de lectura. El helper no inserta una foto debajo del título ni añade una introducción, pasos o checklist por su cuenta:

- `paragraph` / `intro`: texto plano en `text`.
- `image` / `infographic`: el ID de `asset`, `caption` opcional y tamaño `small`, `medium` o `large`. `layout: wide` aprovecha el ancho, `inset` crea una pieza más pequeña, `image_left` / `image_right` coloca la imagen junto al texto de `aside`. Usa párrafos breves en composiciones laterales para conservar legibilidad.
- `steps` / `checklist`: lista de `items`, solo donde esa herramienta aporte valor.
- `callout`: `title` y `body`.
- `page_break`: salto editorial explícito entre bloques; no al comienzo o cierre de una sección.

Las imágenes mantienen proporciones y transparencia; no se recortan ni estiran. Los fondos y las cajas ya forman parte del asset diseñado: el PDF no los encierra todos en la misma tarjeta. `background: waves` agrega ondas muy tenues en los márgenes; `plain` (predeterminado) mantiene fondo limpio. Todo usa el tono inferido. Las fuentes TTF propias se pasan con `--font-regular` / `--font-bold`; sin ellas usa Helvetica.

## Generar y verificar

Localiza Python/ReportLab/Pillow con las dependencias del host. Para QA usa pypdf/pdfplumber y Poppler o un renderizador disponible.

```sh
python scripts/build_ebook.py manuscript.json --output ebook.pdf
pdftoppm -scale-to 1200 -png ebook.pdf preview/page
```

La salida informa páginas y paleta inferida. Conserva ese resultado junto al manuscrito, referencia, región, prompts y assets. Fuentes consultadas se guardan como `sources: [{label, url}]` con HTTPS; el helper las imprime solo si existen.

Renderiza e inspecciona todas las páginas. Revisa identidad del producto, información y rótulos de las infografías, consistencia con la dirección visual, variedad de composición, contraste, saltos y espacio en blanco. Corrige piezas que no coincidan con la referencia o la estética antes de entregar. Extrae texto y prueba enlaces. Un PDF creado no confirma una experiencia editorial terminada ni entrega automática con las compras.
