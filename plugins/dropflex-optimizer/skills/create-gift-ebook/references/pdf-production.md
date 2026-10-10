# Páginas generadas como imágenes → PDF automático

El chat escribe, diseña y genera cada página terminada como una imagen. DropFlex aporta hechos, estrategia y referencia real. El helper une esos archivos en orden, una imagen por página de PDF, sin volver a maquetar. Se ejecuta en el entorno del chat y no configura la entrega con pedidos.

## Preparar y generar

Inspecciona la referencia canónica. Elige la región del producto o su envase, evitando fondo, manos u otros objetos, e infiere su paleta:

```sh
python scripts/build_ebook.py --inspect-reference assets/product-base.webp --subject-region 0.12 0.10 0.88 0.90
```

Las coordenadas son [izquierda, arriba, derecha, abajo], entre 0 y 1. El helper filtra blancos/negros y prioriza colores suficientemente representados; en productos neutros usa tonos neutros. Revisa el resultado y ajusta la región si corresponde. No uses el acento informado por la PDP.

Antes de llamar al generador, prepara un plan editorial con contenido literal por página, finalidad y composición. Define una proporción común; el formato vertical suele servir a la lectura móvil. Recomienda al menos 1024 píxeles en el lado menor y más resolución para páginas con texto. Si el contenido exige texto diminuto, divídelo entre más páginas.

Genera una página completa por llamada. El prompt incluye:

- Papel de cada referencia: foto canónica para identidad; página aprobada o ejemplo para estilo.
- Paleta inferida y dirección común de tipografía, iluminación, fondos y materiales.
- Texto literal y jerarquía; propósito y composición propios de esa página.
- Imagen del producto e infografía contextual integradas cuando corresponda.
- Proporción, resolución y petición de arte plano a sangre: sin UI, marco, mockup de libro ni mosaico de varias páginas.

Mantén la referencia real adjunta siempre que aparezca el producto. Una página de estilo no la sustituye. Conserva silueta, proporciones, piezas, materiales y detalles confirmados. Varía escenas, encuadres y distribución según el contenido; no ubiques fotos o texto siempre en el mismo lugar.

La portada es obligatoria y tiene imagen propia del producto. El interior incluye otra representación del producto y una infografía útil diseñada para las acciones de esta guía; una página puede cumplir ambas funciones. La infografía, sus rótulos y el texto educativo son parte de la imagen completa. No se entregan como piezas sueltas para reconstruir una plantilla de PDF.

Revisa cada página contra su texto antes de aprobarla. Usa OCR si está disponible para detectar omisiones o erratas, seguido de inspección visual: el código no comprueba exactitud del texto ni fidelidad del producto. Regenera la página que falle manteniendo referencias y dirección. La captura de ejemplo del usuario es inspiración editorial, no una fuente de identidad del producto ni una paleta obligatoria.

## Manifiesto 3.0

El array `pages` es el orden exacto; la primera es `cover`, todas las demás `content`. Los archivos son páginas completas ya aprobadas. Este ejemplo mínimo describe el contrato, no fija un ebook de dos páginas ni una estructura para todas las categorías:

```json
{
  "schema_version": "3.0",
  "title": "Tu espacio, listo para empezar",
  "product_name": "Nombre confirmado del producto",
  "product_reference": {
    "id": "ID de la referencia canónica",
    "path": "assets/product-base.webp",
    "subject_region": [0.12, 0.10, 0.88, 0.90]
  },
  "visual_direction": {
    "style": "Editorial limpio, tipografía consistente, luz suave y ondas tenues",
    "palette_basis": "Tonos del producto y su envase, aislados del fondo"
  },
  "pages": [
    {
      "id": "cover",
      "role": "cover",
      "label": "Portada",
      "path": "pages/01-cover.png",
      "text": "Todo el texto literal incluido en esta imagen de portada",
      "prompt": "Prompt completo utilizado para generar la página",
      "source": "generated_from_reference",
      "contains_product": true,
      "reference_id": "ID de la referencia canónica",
      "has_infographic": false
    },
    {
      "id": "daily-routine",
      "role": "content",
      "label": "Una rutina posible",
      "path": "pages/02-daily-routine.png",
      "text": "Todo el texto literal de la página, incluidos rótulos y numeración",
      "prompt": "Prompt completo de la página con la infografía original integrada",
      "source": "generated_from_reference",
      "contains_product": true,
      "reference_id": "ID de la referencia canónica",
      "has_infographic": true
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
  },
  "sources": [
    {"label": "Documento consultado del fabricante", "url": "https://example.com/product"}
  ]
}
```

Las claves van en inglés y el contenido usa el idioma del mercado. `brand`, `context`, `landing_gift` y `sources` son opcionales y se conservan en el manuscrito, sin imprimirlos automáticamente. `sources` contiene solo fuentes realmente consultadas; la URL del ejemplo es un marcador de contrato.

Cada página requiere ID único, `label` (bookmark de navegación), archivo local PNG/JPEG/WebP estático, texto literal y prompt completo. `contains_product` y `has_infographic` son booleanos. `source` es `generated_from_reference` cuando aparece el producto y `generated` en otro caso. Las que muestran el producto deben guardar su `reference_id`. Estos datos declaran la procedencia; no demuestran que se adjuntó la foto ni que los rótulos sean correctos.

Las rutas son relativas al manifiesto o absolutas. El helper no descarga URLs, llama generadores ni recibe `accent_color`: infiere la paleta desde la referencia para trazabilidad, sin recolorear las páginas. Rechaza imágenes ilegibles, animadas, duplicadas, con lado menor inferior a 768 píxeles o con proporciones que difieran más de 0,5 %. No admite sobrescribir una imagen con el PDF. La inspección final comprueba calidad de lectura, composiciones distintas y referencias.

## Ensamblar sin confirmación adicional

Con las páginas aprobadas, ejecuta el ensamblador automáticamente; una galería opcional no es el final del trabajo:

```sh
python scripts/build_ebook.py manuscript.json --output ebook.pdf
pdftoppm -scale-to 1536 -png ebook.pdf preview/page
```

El helper coloca cada imagen a sangre: no agrega márgenes, marcos, encabezados, ondas, numeración ni textos. No recorta, estira ni reduce resolución. Usa ancho A5 y calcula la altura de cada hoja desde la proporción de su imagen; permite pequeñas diferencias por redondeo de píxeles. Aplica orientación EXIF, convierte a RGB y compone transparencias sobre blanco. ReportLab incrusta los píxeles sin compresión con pérdida adicional. Una fuente JPEG ya puede contener pérdida previa; el helper no la recupera.

La salida JSON informa `mode: "page_images"`, número de páginas, imágenes en orden y paleta inferida. Cada página tiene bookmark con su `label`. Las fuentes y el texto editable quedan en el manuscrito; no se añade una página de referencias fuera de las imágenes aprobadas. Si se necesita una página de fuentes visible, diséñala y genérala como otra imagen.

Renderiza e inspecciona todas las hojas. Comprueba orden, cobertura de borde a borde, ausencia de recortes y nitidez frente a los originales. El PDF contiene imágenes: el texto no es seleccionable ni buscable por defecto y un enlace dibujado no es clicable. Una extracción vacía es esperable y no sirve para revisar el contenido; compáralo con el manuscrito y las páginas, con OCR opcional.

Entrega PDF, imágenes ordenadas, manifiesto y contenido editable. Si el entorno no puede ejecutar Python/ReportLab/Pillow, usa un ensamblador local equivalente con las mismas propiedades. Comunica un bloqueo real si no puedes completar el PDF; no afirmes que está listo ni sustituyas silenciosamente el diseño por una guía de texto.

## Compatibilidad anterior

El helper conserva el contrato 2.0 (`visual_assets`, `cover`, `chapters[].blocks`) para editar ebooks existentes sin romperlos. No es el modo de nuevas guías. Para convertir una anterior, recupera su contenido y genera páginas completas con dirección visual coherente; crea el manifiesto 3.0 y une sus imágenes. Los argumentos `--font-regular` / `--font-bold` pertenecen a la maquetación 2.0; en 3.0 la tipografía ya está en las imágenes.
