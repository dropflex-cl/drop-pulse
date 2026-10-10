# Ebook de regalo desde el chat

El plugin DropFlex · Optimización 1.4.0 incorpora `create-gift-ebook` 1.0.0, junto a `optimize-product` 1.4.0. La nueva skill crea un PDF ilustrado y útil como regalo permanente con cada compra del producto, incluida una unidad. Su fuente está en `plugins/dropflex-optimizer/skills/create-gift-ebook/`.

## Invocación y contexto

«Crea un ebook de regalo para mi producto con su ángulo elegido y el acento de su PDP» activa el recorrido. La skill recupera `get_product_context` y `get_product_strategy`: hechos, cliente ideal, JTBD, objeciones, diferenciador, ángulo, hook y oferta vigente. Crear el ebook no vuelve a abrir la elección de hooks ni modifica la estrategia.

`get_landing_content` con `component: "listing"` entrega opcionalmente `data.appearance`: `accent_color` y `accent_source` (`product` o `default`). El repositorio real lee `products.page_accent_color` del dueño únicamente después de que la RPC de landing autoriza la lectura; null usa `DEFAULT_ACCENT`, el predeterminado de DropFlex. No necesita migración ni modifica el color guardado. Las lecturas de otros componentes y las escrituras no hacen esta consulta adicional. Un cliente antiguo puede entregar el contrato anterior: la skill usa un acento confirmado por el comerciante o recuperado de la PDP, sin deducirlo de la foto.

La guía complementa el objetivo del comprador con rutinas, ejemplos, consejos y checklists aplicables. El producto aparece cuando ayuda a ejecutar una acción; el ebook aporta valor por sí solo. El tema de cuidado de la piel o bienestar usa consejos educativos respaldados y no inventa tratamientos, diagnósticos ni resultados clínicos. Se conserva la instrucción comercial del plugin: internet complementa información del producto y su uso, sin investigar leyes locales ni regulación.

## Producción y entrega

La skill incluye un contrato de manuscrito JSON y `scripts/build_ebook.py`. El generador se ejecuta en el entorno del chat con ReportLab y Pillow, nunca en la función del MCP. Produce A5 vertical con acento del producto, texto seleccionable, índice navegable, numeración, diagramas vectoriales y soporte de imágenes locales. Admite fuentes TTF de marca y conserva una variante de texto contrastada cuando el acento es claro. Escapa el texto del manuscrito y valida campos, imágenes y enlaces.

El MCP anuncia dos skills con ocho recursos autorizados, incluidos los scripts como `text/x-python`. Mantiene `skill://dropflex/optimize-product/SKILL.md` y añade `skill://dropflex/create-gift-ebook/SKILL.md`; sus recursos tienen hashes SHA-256. El trace de `/api/mcp` incluye ambas carpetas. Las URIs no permiten traversal, paths ni URLs externos.

El entregable es un PDF descargable, manuscrito editable, contexto de procedencia, fuentes y texto para presentar «Incluido gratis con cada compra» en la PDP. Crear el archivo no configura la entrega con los pedidos. El MCP actual no conserva PDFs como assets ni ofrece un mecanismo de regalo digital o envío a compradores: la skill comprueba el mecanismo real antes de declarar entrega conectada. Las tools de ingestión de imágenes no sirven para PDFs. No hay tabla ni bucket nuevos ligados al producto; los archivos permanecen en el entorno del chat hasta una integración de documentos autorizada.

Para incorporar el texto a la PDP se requiere ese pedido y la autorización de publicación vigente. La skill usa el contrato de un componente compatible, como `offer-summary`, conserva contenido válido y no convierte un recurso digital en un elemento físico dentro de la caja. El ebook no recibe un precio de referencia ficticio ni exige elegir un pack.

## Validación

La prueba editorial genera `output/pdf/ebook-demo-organizador.pdf`: seis páginas sobre ordenar un escritorio, con acento verde azulado de muestra y contexto marcado como demo. No representa un producto real conectado. Se renderizaron e inspeccionaron todas las páginas; la primera revisión detectó un destacado aislado y se corrigió antes de la entrega.

Se comprobó además un manuscrito largo de 17 páginas, texto literal con signos y etiquetas, índice navegable, enlaces, imágenes locales, contraste con acento blanco y rechazo de cuatro entradas inválidas. Las pruebas MCP verifican ambos catálogos completos, hashes, MIME del script, autenticación y revocación de recursos, junto con la lectura autorizada del acento y su valor predeterminado. El validador de skills comprueba ambos frontmatters. La calidad editorial de otro producto y la ejecución de Python en ChatGPT móvil necesitan validarse en ese cliente; la skill comunica si el host no permite crear archivos.

La suite completa pasó con 1191 pruebas y 135 omitidas por sus condiciones de entorno. Typecheck, lint de los archivos afectados, contratos y validación de ambas skills pasaron. La compilación de producción con Webpack pasó y su trace contiene los ocho recursos; Turbopack no pudo iniciar su proceso de CSS por un error de permisos al abrir un puerto en este entorno.

Se actualizó el plugin privado existente a 1.4.0, release `pluginrel_6aca5ffd55508191a62a0a8ccafd9cf5`. La lectura posterior verificó los siete archivos enviados y los once del paquete completo, conservando identidad, conexión, presentación y audiencia. El paquete local reproducible incluye ambas skills; no incluye los archivos de muestra de `output/`.
