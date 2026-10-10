# Ebook de regalo desde el chat

DropFlex · Optimización 1.5.0 incluye `create-gift-ebook` 2.0.0 y `optimize-product` 1.5.0. La skill crea una guía útil como regalo permanente con cada compra: portada dedicada, infografías propias e imágenes diferentes creadas desde la referencia del producto. Su fuente vive en `plugins/dropflex-optimizer/skills/create-gift-ebook/`.

## Contexto y dirección visual

«Crea un ebook de regalo para este producto y su ángulo, con imágenes e infografías propias» activa el recorrido. Recupera hechos, cliente ideal, JTBD, objeciones, diferenciador, ángulo, hook y oferta con el MCP. El contenido complementa el objetivo de la compra con acciones, ejemplos y recursos aplicables, sin volver a abrir la elección de hooks.

La referencia canónica se inspecciona y se adjunta a cada generación que contenga el producto. El chat define el propósito de cada pieza, su composición y una dirección visual común; las imágenes e infografías se crean con el generador disponible. Los diagramas simples pueden ser vectores propios. Cada asset conserva prompt, propósito, origen e ID de referencia. Los archivos viven en el entorno del chat, no en el servidor MCP.

El acento se infiere desde la región del producto o su envase en la foto real. `build_ebook.py --inspect-reference` devuelve la paleta antes de generar los assets. El helper descarta blancos/negros de fondo y prioriza colores suficientemente representados en el sujeto; en productos neutros utiliza sus tonos neutros. El chat elige y comprueba la región para no tomar el fondo, una mano u otro objeto. Los prompts y el PDF comparten esa paleta, luz, materiales y tratamiento gráfico.

`get_landing_content.data.appearance` sigue disponible para otros usos del MCP, pero la skill de ebook no toma su acento como fuente ni modifica el color guardado de la PDP.

Las búsquedas complementan información del producto y su uso, sin investigar leyes locales. El contenido de cuidado o bienestar usa consejos educativos respaldados, sin inventar diagnósticos, dosis ni resultados clínicos.

## Composición y contrato 2.0

El manuscrito usa `schema_version: "2.0"`, `product_reference`, `visual_direction`, `visual_assets`, una selección explícita de portada y `chapters[].blocks`. El contrato anterior de `product_images` y posiciones fijas se migra recuperando su contenido útil y creando las piezas faltantes. El helper pide esa migración, sin maquetar silenciosamente con el patrón anterior.

El orden de bloques es el orden de lectura. Las imágenes pueden ser anchas, pequeñas o acompañar texto por izquierda/derecha; los tamaños y la posición se deciden según su función. Las infografías son assets originales con una explicación concreta, en lugar de una lista genérica de cajas creada por el helper.

La portada permite imagen o promesa primero. El índice es opcional, y las secciones pueden continuar en una misma página o empezar una nueva. No se inserta automáticamente una foto debajo de cada título ni se fija una secuencia de introducción/imagen/párrafos/checklist. El fondo liso es predeterminado y las ondas tenues son opcionales. Se conservan lectura móvil, proporciones, transparencia, tipografía y espacio en blanco.

El helper valida la referencia local, archivos, procedencia declarada, prompts y uso real de los assets. Requiere una portada propia creada desde la referencia, otra escena/detalle generado del producto en el interior con hash diferente y una infografía propia utilizada. El hash detecta repetir el mismo archivo bajo otro nombre; la inspección visual compara identidad, rótulos y estética, que el código no puede verificar.

No llama proveedores, usa claves de IA ni genera assets. Se ejecuta localmente con ReportLab y Pillow. La skill orquesta las generaciones antes de componer; si falta generador o referencia, comunica el asset pendiente y no da una guía de fotos repetidas por terminada.

## MCP y entrega

El MCP anuncia dos skills y ocho recursos autorizados, con hashes SHA-256 y script Python como `text/x-python`. Se conservan las URIs e integraciones existentes y el trace de producción. No hay tablas ni buckets nuevos.

La entrega es PDF, manuscrito editable, referencia, región, dirección visual, prompts, assets y texto para anunciar «Incluido gratis con cada compra». Crear estos archivos no configura su entrega con los pedidos; el MCP actual no ingiere documentos ni ofrece envío de regalos digitales. Anunciarlo o publicar la PDP requiere el pedido y autorización correspondientes, usando los writers existentes.

## Validación

La prueba visual usa una referencia sintética marcada como QA, sin atribuirla a un producto real conectado. Se generaron con la herramienta de imágenes una portada, una infografía contextual y una escena distinta, con referencia y estilo compartidos. Los archivos de ensayo permanecen en `output/pdf/`, fuera del plugin y del commit. El ejemplo no sustituye la referencia real en producción.

Se renderizaron e inspeccionaron las tres páginas de `ebook-editorial-qa.pdf`: portada con imagen primero, infografía después de la explicación y escena lateral con texto. La prueba adicional comprobó ambas portadas, índice opcional y bookmarks, ambas posiciones laterales, cambio de orden de bloques, secciones continuas, enlaces y 12 páginas de contenido largo sin perder el cierre. Se rechazaron 12 entradas inválidas, incluyendo acento informado, referencia incoherente, imagen repetida, infografía sin usar y portada excesiva. Una prueba con fondo azul y sujeto rojo confirmó que la región del sujeto determina el acento. La sintaxis Python, el JSON de ejemplo y ambos validadores de skills pasaron.

La suite pasó con 1191 pruebas y 135 omitidas por sus condiciones de entorno. La compilación de producción con Webpack, incluido TypeScript, pasó; el trace contiene los ocho recursos. El lint global conserva los errores existentes del tema Shopify documentados en la revisión anterior; no se ampliaron los cambios a esos archivos. La generación y fidelidad con un producto real conectado y la ejecución desde ChatGPT móvil requieren validación en ese contexto.

Se actualizó el plugin privado a 1.5.0, release `pluginrel_6aca775bd9a88191ace717b274235a74`. La lectura posterior verificó los siete archivos enviados y los once del paquete, conservando identidad, conexión, presentación y audiencia. El ZIP reproducible contiene ambas skills y excluye los assets de ensayo.
