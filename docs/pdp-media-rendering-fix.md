# Imágenes asignadas en la PDP — 2026-10-12

Las imágenes elegidas de beneficios, mecanismo, casos de uso, pasos e historias del producto `5fc0c212-67de-402b-b7a5-8b61f2643d6f` ya estaban persistidas y publicadas en sus metafields. Los archivos de Shopify estaban `READY`. El tema trataba las listas de referencias como arrays ordinarios y consultaba variantes ausentes: omitía imágenes y mostraba estados vacíos.

Los snippets canónicos materializan los archivos mediante `where: 'id'` antes de consultar posiciones, conservan el orden elegido y comprueban que exista la variante antes de reemplazar sus medios. La imagen individual de beneficios se resuelve mediante `preview_image`. El mismo arreglo cubre GIF, estadísticas y UGC. El contrato de datos, destinos y metafields permanece vigente; no requiere migraciones, generación ni cambios de tools o de la skill. Las copias del tema se regeneraron con `shopify:components`.

La biblioteca de Imágenes muestra los usos seleccionados y permite asignar archivos a los destinos nativos de componentes. Lee las decisiones actuales; no exige estados históricos de aprobación y excluye descartes y selecciones quitadas.

Verificación:

- 159 pruebas de asignaciones, publicación, variantes, contexto y paridad Liquid/React; también 194 pruebas del catálogo canónico.
- TypeScript, lint de archivos afectados, contratos MCP, valores del design system y `check:shopify`: correctos. Theme Check conserva 45 advertencias preexistentes y no presenta errores.
- Compilación de producción con webpack correcta. Turbopack local no pudo abrir el puerto de su proceso CSS (`Operation not permitted`).
- Se respaldaron y corrigieron únicamente seis snippets del tema publicado `188903719139`. Se leyeron de vuelta y se comprobó su contenido exacto; no se cambiaron templates, selecciones ni metafields.
- En la PDP de Datazo se verificaron las siete imágenes de bloques contra los archivos elegidos: beneficios, mecanismo, primer caso, primer paso y tres historias. La vista de historias abre los archivos correctamente. Evidencia local en `output/pdp-media-fix/`.
