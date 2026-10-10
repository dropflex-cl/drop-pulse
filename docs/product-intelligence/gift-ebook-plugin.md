# Ebook de regalo desde el chat

El plugin DropFlex · Optimización 1.4.1 incorpora `create-gift-ebook` 1.1.0, junto a `optimize-product` 1.4.1. La skill crea un PDF ilustrado y útil como regalo permanente con cada compra del producto, incluida una unidad. Todo ebook tiene portada dedicada, imágenes del producto en portada e interior e infografías explicativas. Su fuente está en `plugins/dropflex-optimizer/skills/create-gift-ebook/`.

## Invocación y contexto

«Crea un ebook de regalo para mi producto con su ángulo elegido y el acento de su PDP» activa el recorrido. La skill recupera `get_product_context` y `get_product_strategy`: hechos, cliente ideal, JTBD, objeciones, diferenciador, ángulo, hook y oferta vigente. Crear el ebook no vuelve a abrir la elección de hooks ni modifica la estrategia.

`get_landing_content` con `component: "listing"` entrega opcionalmente `data.appearance`: `accent_color` y `accent_source` (`product` o `default`). El repositorio real lee `products.page_accent_color` del dueño únicamente después de que la RPC de landing autoriza la lectura; null usa `DEFAULT_ACCENT`, el predeterminado de DropFlex. No necesita migración ni modifica el color guardado. Las lecturas de otros componentes y las escrituras no hacen esta consulta adicional. Un cliente antiguo puede entregar el contrato anterior: la skill usa un acento confirmado por el comerciante o recuperado de la PDP, sin deducirlo de la foto.

La guía complementa el objetivo del comprador con rutinas, ejemplos, consejos y checklists aplicables. El producto aparece cuando ayuda a ejecutar una acción; el ebook aporta valor por sí solo. El tema de cuidado de la piel o bienestar usa consejos educativos respaldados y no inventa tratamientos, diagnósticos ni resultados clínicos. Se conserva la instrucción comercial del plugin: internet complementa información del producto y su uso, sin investigar leyes locales ni regulación.

## Producción y entrega

La skill incluye un contrato de manuscrito JSON y `scripts/build_ebook.py`. El generador se ejecuta en el entorno del chat con ReportLab y Pillow, nunca en la función del MCP. Produce A5 vertical con acento del producto, texto seleccionable, índice navegable y numeración. La portada medida siempre ocupa la primera página; una portada demasiado larga se rechaza con una acción concreta, sin dividirla ni reducir la letra. Admite fuentes TTF de marca y conserva una variante de texto contrastada cuando el acento es claro. Escapa el texto del manuscrito y valida campos, imágenes y enlaces.

`product_images` conserva los archivos reales y su procedencia; la primera imagen protagoniza la portada. `chapters[].product_image` elige un índice para las fotos interiores; si no se especifica ninguno, el primer capítulo muestra la imagen base. Las fotos se contienen en un marco tenue, sin recortar ni deformar. La skill recupera la referencia canónica y reutiliza imágenes aprobadas compatibles. Si falta el archivo del producto, avanza el contenido pero no declara terminado un PDF que omite la imagen.

Las infografías interiores son obligatorias: secuencias con pasos conectados, checklists con marcas vectoriales y comparaciones rotuladas. El diseño mantiene aire, jerarquía editorial y una regla discreta con el acento de la PDP. `background` admite `waves` por defecto o `plain`; las ondas son mezclas muy claras del acento sobre blanco, limitadas a los márgenes, fuera del marco del texto y las fotos.

El MCP anuncia dos skills con ocho recursos autorizados, incluidos los scripts como `text/x-python`. Mantiene `skill://dropflex/optimize-product/SKILL.md` y añade `skill://dropflex/create-gift-ebook/SKILL.md`; sus recursos tienen hashes SHA-256. El trace de `/api/mcp` incluye ambas carpetas. Las URIs no permiten traversal, paths ni URLs externos.

El entregable es un PDF descargable, manuscrito editable, contexto de procedencia, fuentes y texto para presentar «Incluido gratis con cada compra» en la PDP. Crear el archivo no configura la entrega con los pedidos. El MCP actual no conserva PDFs como assets ni ofrece un mecanismo de regalo digital o envío a compradores: la skill comprueba el mecanismo real antes de declarar entrega conectada. Las tools de ingestión de imágenes no sirven para PDFs. No hay tabla ni bucket nuevos ligados al producto; los archivos permanecen en el entorno del chat hasta una integración de documentos autorizada.

Para incorporar el texto a la PDP se requiere ese pedido y la autorización de publicación vigente. La skill usa el contrato de un componente compatible, como `offer-summary`, conserva contenido válido y no convierte un recurso digital en un elemento físico dentro de la caja. El ebook no recibe un precio de referencia ficticio ni exige elegir un pack.

## Validación

La prueba de maquetación genera `output/pdf/ebook-premium-qa.pdf`: siete páginas, portada dedicada, imagen en portada e interior, cuatro infografías y ondas tenues. Utiliza una imagen sintética marcada como fixture de QA y un acento de muestra; no representa un producto real conectado ni sirve como sustituto de su referencia en producción. Se renderizaron e inspeccionaron todas las páginas, sin recortes ni solapamientos.

Se comprobó además un manuscrito largo de 18 páginas, texto literal con signos y etiquetas, índice navegable, enlaces, imágenes locales, contraste con acento blanco y fondo liso. Se verificó la imagen embebida en portada e interior, y se rechazaron ocho entradas inválidas: imagen ausente, archivo inexistente o ilegible, origen no admitido, infografía interior ausente, índice fuera de rango, fondo no admitido y portada excesiva. Las pruebas MCP verifican ambos catálogos completos, hashes, MIME del script, autenticación y revocación de recursos, junto con la lectura autorizada del acento y su valor predeterminado. El validador de skills comprueba ambos frontmatters. La calidad editorial de otro producto y la ejecución de Python en ChatGPT móvil necesitan validarse en ese cliente; la skill comunica si el host no permite crear archivos.

La suite completa pasó con 1191 pruebas y 135 omitidas por sus condiciones de entorno. La compilación de producción con Webpack, incluido TypeScript, pasó y su trace contiene los ocho recursos. La validación de ambas skills y el análisis de sintaxis de Python pasaron. El lint global reportó 139 errores y cinco advertencias en archivos existentes sin cambios en esta tarea, principalmente assets del tema Shopify; no se modificaron para ampliar el alcance del pedido.

Se actualizó el plugin privado existente a 1.4.1, release `pluginrel_6aca6aca7bac8191b71f5838b3bd8815`. La lectura posterior verificó los siete archivos enviados y los once del paquete completo, conservando identidad, conexión, presentación y audiencia. El paquete local reproducible incluye ambas skills; no incluye los archivos de QA ni de muestra de `output/`.
