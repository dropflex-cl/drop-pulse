> La compatibilidad de endpoints 410 y del contrato cerrado de landing se sustituye por [ADR 017](017-remove-retired-analysis.md). Consultar [estado vigente](../implementation-status.md).

# ADR 015: retirar la redacción pagada del servidor

Estado: aceptado e implementado localmente, 2026-10-06.

## Contexto

El comerciante confirmó que los textos se preparan desde ChatGPT y pidió eliminar el código deprecado. Quedaban writers de estrategia, landing, anuncios, eventos y WhatsApp activos pese al retiro de guiones UGC y etiquetas.

## Decisión

Eliminar físicamente ejecución, prompts, arranque de trabajos y acciones UI de redacción pagada. Mantener handlers autenticados 410 para clientes antiguos y lectores/revisión de artefactos existentes. El render y la revisión visual opcional permanecen con proveedores propios del comerciante. Anthropic solo es requisito cuando el QA visual está encendido.

Conservar esquemas de lectura, tipos, filas/tablas, costos históricos y migraciones. No introducir proyecciones del conocimiento PI en análisis legacy. La selección de estrategia en la UI usa el mismo servicio que MCP.

## Consecuencias

No quedan writers pagados de texto como fallback. El guard de arquitectura limita generateStructured a tres callers QA. Los renders de medios y las operaciones Shopify/Meta permanecen.

La falta de ingestión MCP para conceptos estáticos, planes de galería, eventos y consejos WhatsApp se hace explícita: esos materiales nuevos no pueden guardarse aún desde MCP. Retirar el gasto no implica haber implementado sus contratos. El siguiente paquete debe añadir esos adapters con CAS, snapshots, receipts, autorización y revisión, reutilizando las tablas operativas.

No requiere migración ni borra contenido. Las invocaciones ya iniciadas en una versión anterior tienen que concluir antes de considerar efectivo el retiro del despliegue. [Inventario, límites, rollout y rollback](../legacy-text-retirement.md).
