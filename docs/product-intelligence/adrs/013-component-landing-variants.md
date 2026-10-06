# ADR 013 — Variantes de contenido por componente y URL

Estado: implementado localmente. Dirección autorizada por el comerciante el 2026-10-06.

## Decisión

Cada componente y listing conserva su almacenamiento actual en `page_components`. `content` admite un objeto histórico o un array de variantes `{ key, angle_id, hook_id, content, images? }`. El MCP reutiliza los schemas existentes. Se exige default y selección exacta → ángulo → default mediante `df_angle`/`df_hook`.

La UI revisa el conjunto y puede editar cada variante con CAS de fila/contexto. La tienda solo activa HTML prepublicado. Precios, packs y hechos permanecen comunes; una variante seleccionada es una ejecución, no una estrategia ganadora.

Los pools de archivos se separan de JSON usando `file_reference`, sin exponer picks de Storage. Se mantiene un lote atómico para arrays e índices/archivos asociados. Se comprueba que el tema publicado sea compatible antes de guardar arrays en Shopify.

## Motivos y consecuencias

Evita duplicar productos, páginas, pricing y capacidades existentes. Conserva objetos históricos y permite granularidad distinta por componente. Sin JavaScript/para SEO se usa default; no se atribuye performance por URL automáticamente. El conjunto se limita a 12 variantes por componente, y un mismo enlace puede utilizar fallback en algunos componentes.

Los selectores son IDs de ejecución, sin FK a estrategia/hooks en esta entrega. Coordinarlos es responsabilidad del chat; el contrato no presenta esa relación como comprobada. La aprobación engloba todas las variantes. La publicación Shopify sigue siendo un proceso de pasos separados, salvo el lote de variantes/archivos.

Implementación, despliegue/rollback y límites: [landing-variants-mcp.md](../landing-variants-mcp.md). No se aplicó en producción.
