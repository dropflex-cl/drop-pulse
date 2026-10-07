# Backlog vigente

Implementación de conocimiento, contenido, renders y aprendizaje completada; [estado](implementation-status.md). Writers pagados y endpoints/contrato retirados eliminados. No quedan paquetes de ingestión pendientes de las entregas anteriores.

1. **Rollout de limpieza:** desplegar primero este código compatible con ambos esquemas; verificar lectores, revisión, renders, publicación y ausencia de jobs antiguos. Exportar las ocho tablas y tres columnas retiradas y aplicar `20261118000000` en producción. Comprobar conservación de contenido/costos/campañas, permisos, cascadas y lectura real. [Runbook](migration-and-rollback.md).
2. **MCP/OAuth público:** verificar despliegue, configuración y discovery; conectar desde ChatGPT y aceptar consentimiento/scopes, lectura/guardado, recuperación desde un chat nuevo y revocación. Última comprobación pública: 404.
3. **Workers y piloto:** verificar cron UGC/galería y recuperación tras interrupción. Ensayar un render explícito por proveedor y replay sin segundo envío/gasto; revisar/aprobar piezas y publicar únicamente en tienda de ensayo.
4. **Tema Shopify:** verificar instalación de las fuentes actuales y producto con/sin `df_angle`/`df_hook`, fallback, imágenes/videos, carrito y checkout. Confirmar por readback Shopify/Meta lo publicado.
5. **Medición comercial:** integrar una fuente comprobada de pedidos COD confirmados, entregados y cobrados, y atribución por selector. Las compras de Meta no equivalen a cobros ni prueban causalidad. Learning actual guarda observación/criterio/limitaciones, sin declarar ganadores.
6. **Robustez posterior:** manifiesto completo de versión/publicación PDP, retención/readback de assets y resolución operativa de envíos de proveedor ambiguos sin request ID. Corregir diagnósticos de build preexistentes en Ads/onboarding.

Catálogo, Auth, Storage, precios/packs, Shopify, Meta, revisión humana y QA visual opcional se conservan. No reintroducir writers de pago ni importar análisis eliminado para completar contexto.
