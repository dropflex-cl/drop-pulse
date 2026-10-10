# Ebook de regalo desde el chat

DropFlex · Optimización 1.6.0 incluye `create-gift-ebook` 3.0.0 y `optimize-product` 1.6.0. La skill genera las páginas completas como imágenes con texto, fotos e infografías integrados y las une automáticamente en un PDF. El ebook aporta utilidad como regalo permanente con cada compra, incluida una unidad. Su fuente vive en `plugins/dropflex-optimizer/skills/create-gift-ebook/`.

## Contenido y dirección visual

El MCP entrega hechos, cliente ideal, JTBD, objeciones, diferenciador, ángulo, hook, oferta y referencia canónica del producto. La guía complementa el objetivo de la compra, sin volver a elegir hooks. La referencia se inspecciona y se adjunta siempre que una generación muestre el producto.

El acento se infiere desde la región del producto o su envase con `build_ebook.py --inspect-reference`; no se toma del color informado o guardado en la PDP. Se define una dirección común de paleta, tipografías, luz, materiales y gráficos. Una guía aportada por el usuario inspira el tratamiento editorial, sin imponer su categoría, producto ni paleta. Las composiciones varían según el contenido y no fijan las imágenes en el mismo lugar.

Las búsquedas complementan información del producto y su uso, sin investigar leyes locales. El contenido de cuidado o bienestar conserva consejos educativos respaldados, sin inventar diagnósticos, dosis ni resultados clínicos.

## Páginas completas y ensamblado

El recorrido predeterminado es contenido literal por página → generación de imágenes completas → revisión de texto y diseño → PDF automático. La portada es obligatoria, el interior contiene una representación distinta del producto y una infografía propia útil. Los títulos, párrafos, fotografías, rótulos, ondas y numeración se generan dentro de cada imagen. No se construye primero un PDF de texto ni se reconstruye su diseño con bloques después.

Una página aprobada sirve de referencia adicional de estilo, sin sustituir la foto canónica. El chat revisa cada imagen contra el manuscrito y el producto; OCR ayuda si existe, pero no sustituye la inspección visual. Se regenera la página defectuosa antes de ensamblar. La galería opcional es una previsualización; el flujo no se detiene ahí ni solicita una nueva confirmación para crear el PDF.

El manifiesto `schema_version: "3.0"` conserva `product_reference`, `visual_direction` y `pages[]` ordenadas, cada una con ID, rol, etiqueta, ruta, texto literal, prompt y procedencia. Las páginas que muestran el producto conservan el ID de referencia. El contrato completo vive en `references/pdf-production.md`.

`build_ebook.py` valida archivos, referencia, portada, infografía e imagen interior declaradas, proporciones comunes y duplicados por píxeles. Requiere archivos estáticos PNG/JPEG/WebP y al menos 768 píxeles en el lado menor; la skill recomienda más resolución según el texto. La declaración de procedencia no reemplaza revisar fidelidad ni comprobar lo que escribió el generador.

El ensamblador coloca una imagen por hoja, a sangre y en orden, sin añadir márgenes, texto, decoraciones ni páginas de fuentes. Usa ancho A5 y altura calculada desde cada imagen para conservar proporciones; tolera diferencias de proporción de hasta 0,5 % por redondeo de píxeles. Aplica EXIF y convierte a RGB, con transparencia sobre blanco, sin reducir resolución ni recomprimir con pérdida. Los bookmarks usan la etiqueta de cada página.

El texto del PDF es rasterizado y no seleccionable por defecto; el texto editable y enlaces de fuentes quedan en el manuscrito. Los enlaces dibujados no son clicables. Para nuevas guías no se sustituye silenciosamente este modo por maquetación de texto. El contrato 2.0 y su maquetador siguen disponibles para actualizar guías existentes.

## MCP, distribución y entrega

El MCP conserva dos skills y ocho recursos autorizados, con SHA-256 y Python como `text/x-python`. No cambian URIs, conexión, permisos, tablas ni buckets. El helper se ejecuta en el entorno del chat, sin claves ni llamadas a proveedores; la skill dirige las generaciones antes de ejecutarlo.

La entrega es PDF, páginas originales ordenadas, manifiesto, texto editable, prompts y contexto editorial. El texto de PDP presenta «Incluido gratis con cada compra». El ensamblado automático del PDF no configura su entrega con pedidos: debe existir un mecanismo real antes de anunciarla como conectada. Publicar la PDP mantiene la autorización y writers existentes.

## Verificación de esta versión

Se generaron con la herramienta de imágenes dos páginas completas: portada y página interior con infografía, desde una referencia sintética marcada como QA y la portada como referencia adicional de estilo. El ejemplo del usuario se usó solo como inspiración editorial. La prueba no se atribuye a un producto conectado.

`output/pdf/ebook-page-images-qa.pdf` se ensambló y renderizó; se inspeccionaron ambas hojas. pypdf confirmó dos imágenes en orden con píxeles RGB idénticos a sus originales, proporciones correctas y ningún texto añadido. Las páginas, manifiesto con prompts y renders permanecen en `output/pdf/`, fuera del paquete y del commit.

`scripts/test-gift-ebook.py` verifica orden, cobertura a sangre, píxeles, bookmarks, transparencia, orientación EXIF/JPEG, duplicados con distinta codificación, proporciones, resolución, procedencia, ausencia de portada/infografía/producto interior, archivos ilegibles/animados y protección de imágenes de entrada. Pasaron sus siete pruebas y ambos validadores de skills. La suite de la aplicación pasó con 1195 pruebas y 135 omitidas por sus condiciones de entorno; el catálogo MCP sirve las versiones y hashes nuevos. Las pruebas de ensamblado verifican archivos y píxeles; la generación y ejecución con un producto real desde ChatGPT móvil requieren ese contexto.

La compilación de producción con Webpack, TypeScript y la comprobación de valores de diseño pasaron. El trace de producción incluye los ocho recursos. El lint global conserva 139 errores y cinco advertencias en archivos ajenos a este cambio, incluidos assets del tema Shopify; no se modificaron para esta tarea.

El plugin privado se actualizó a 1.6.0, release `pluginrel_6aca918566d4819185b0b766a1a5e420`. La lectura posterior verificó los once archivos, las seis fuentes locales modificadas y el manifiesto legado sincronizado, conservando identidad, conexión, presentación y audiencia. El ZIP reproducible contiene ambas skills; excluye las imágenes de ensayo y la prueba de regresión del repositorio.
