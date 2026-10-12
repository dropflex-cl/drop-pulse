# Detección de cambios del tema

Publicación y `updateTheme` comparten un plan obtenido de los archivos reales de Shopify y de las transiciones de plantilla. La desigualdad entre `kit_version` y el kit del servidor no indica que este último sea más reciente. Una fila antigua con archivos actuales no ofrece una actualización ni bloquea la publicación de variantes.

`kit-releases.json`, regenerado por `scripts/kit-releases.ts` desde la historia ancestral y el kit actual, reconoce versiones y huellas de código anteriores. Un servidor no sobrescribe ni elimina código desconocido. Una versión futura que ya comparte todos los archivos actuales se deja intacta; tampoco se cambia su marcador de versión. La escritura vuelve a consultar Shopify y comprueba las transiciones antes de aplicar la primera mutación. Los archivos del comerciante conservan las reglas de protección existentes.

La pantalla muestra «Hay cambios del tema por aplicar» únicamente cuando existen diferencias seguras. Si falla Shopify o el código no puede verificarse, muestra el motivo y no ofrece actualizar. Las comprobaciones de lectura comparten una caché por tienda, instalación y kit de hasta un minuto; una escritura comprueba siempre de nuevo. La pantalla incorpora nuevos datos del servidor y consulta de nuevo al recuperar el foco.

No cambian contratos de componentes, metafields, MCP, skill ni esquema de base de datos. No se genera contenido ni se publica un producto como parte de esta corrección.

Validación: pruebas de huellas antiguas y futuras, archivos desconocidos, restauraciones, templates personalizados y transiciones, escritura tras una lectura vieja, errores de Shopify, caché y publicación de variantes. La consulta de solo lectura del tema `188903719139` verificó 609 archivos, kit registrado y actual `2937337531`, ninguna diferencia pendiente y `outdated: false`; evidencia local en `output/theme-version-fix/production-read.json`.
