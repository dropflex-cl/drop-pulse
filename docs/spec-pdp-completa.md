# PDP completa de DropFlex

La plantilla de producto tiene 27 contratos: la ficha y los 26 componentes del catálogo. Todos se instalan y quedan visibles por defecto, con su estado vacío cuando falta contenido o evidencia. Una decisión explícita de apagar se conserva. Activación por defecto no significa aprobar textos ni autorizar su publicación: las decisiones y la automatización Shopify mantienen sus permisos existentes.

El recorrido predeterminado está en `lib/shopify/themes/DropPulse/templates/product.json`; el catálogo y la vista previa siguen ese orden. Bajo la ficha: beneficios de compra, problema, foto con razones, mecanismo, usos, antes/después, prueba documentada, evolución, pasos, contenido del paquete, imágenes de uso, historias, reseñas, respaldo profesional, comparación, garantía, preguntas y cierre con packs. La ficha conserva demostraciones, videos, reseñas, disponibilidad real y entrega junto al botón; también conserva la compra fija del tema.

## Diez secciones nuevas

| Componente | Contenido y respaldo |
| --- | --- |
| `product-includes` | Contenido que realmente se entrega, fotos opcionales y hechos verificados. No agrega regalos al checkout. |
| `usage-steps` | Pasos numerados, instrucciones respaldadas, fotos opcionales. |
| `use-cases` | Usos desplegables accesibles y compatibilidad documentada. |
| `before-after` | Dos referencias reales de la misma demostración, etiquetas, comparación deslizable accesible; sin JS se ven ambas. |
| `results-timeline` | Etapas/plazos documentados; las cifras deben estar en el hecho elegido. |
| `customer-stories` | Reseñas aprobadas: texto, autor anonimizado, estrellas y fotos originales. |
| `expert-endorsement` | Identidad, credencial y declaración literal documentadas; retrato real opcional. |
| `mechanism` | Explicación breve del mecanismo/características, hechos verificados, foto opcional. |
| `guarantee` | Pago, cambios, garantía y envío desde las políticas reales, con enlaces a condiciones. |
| `offer-summary` | Packs, precio, tachado y ahorro del servidor; CTA de regreso al selector de compra. |

## MCP y editor

`get_component_catalog` descubre todas las capacidades. `get_landing_content` devuelve el contrato, `enabled_by_default` y `empty_state`. `save_landing_content` acepta todos los componentes y hasta 27 entradas por llamada. Cualquier componente salvo `listing` admite `{ "state": "empty" }`, solo o dentro de sus variantes. Este estado no simula contenido ni necesita reseñas de relleno.

Se mantienen hasta 12 variantes por componente, selección `df_angle`/`df_hook`, CAS, idempotencia, revisión y automatización autorizada. Los planes y las experiencias admiten hasta 27 componentes, conservando el límite de siete mensajes principales y el presupuesto de atención de cada sección. Omitir una sección del plan no la oculta: las decisiones explícitas siguen mandando.

El editor tiene selección de hechos por su descripción; solo ofrece hechos aprobados/verificados sin contradicciones. Las imágenes de comparación/retratos se eligen entre referencias. El servidor vuelve a validar respaldo, precios, reseñas e imágenes al guardar y antes de publicar, incluso sin experiencias activas.

## Publicación y actualización

Los archivos se generan con `npm run shopify:components`, desde `lib/shopify/components`; las copias `df-*` del tema y el CSS de React no se editan directamente. Las nuevas imágenes usan la selección, Storage optimizado, Shopify Files y borrado en cascada existentes; no se añaden buckets ni tablas de assets.

La publicación respeta el máximo de 25 metafields por petición. El JSON y los pools de imágenes de cada componente viajan juntos. La arquitectura de experiencias se desactiva durante publicaciones de varios lotes y se activa al final; ante un fallo queda disponible la estructura base y se puede reintentar.

La actualización agrega las secciones nuevas a plantillas DropFlex personalizadas sin duplicar tipos, cambiar ajustes ni reactivar secciones apagadas. Si supera 25 secciones, avisa antes de enviar una plantilla inválida.

Migraciones: `supabase/migrations/20261206000000_rich_product_page.sql` cambia el valor por defecto de `page_components.enabled`, amplía los RPC y permite estados vacíos; `20261207000000_pdp_default_visibility.sql` activa las propuestas antiguas que siguen intactas, sin decisión del comerciante. Conservan autorizaciones y decisiones explícitas previas. No modifican productos existentes en una tienda por sí solas. Para una tienda real se despliegan app/MCP y las migraciones, se actualiza el tema y se publica el contenido aprobado.

## Verificación

Pasaron 1.188 pruebas unitarias, 27 pruebas de integración con Supabase local y seis pruebas en Chromium. La revisión incluye anchos de 390 y 1.440 píxeles, desbordamiento, comparación con teclado, desplegables y estados vacíos. También pasan TypeScript, lint de los archivos modificados, contratos del MCP y reglas de tokens. Shopify Theme Check no encuentra errores; conserva 42 advertencias del tema.

La compilación de producción pasa con Webpack. Turbopack no puede abrir su puerto interno en este entorno (`EPERM`). El lint global conserva errores previos en los archivos del tema Horizon; los cambios pasan su comprobación específica. Las migraciones se aplicaron y probaron solo en Supabase local. No se desplegó la aplicación ni se actualizó una tienda real.
