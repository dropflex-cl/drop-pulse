# ADR 012: etiquetas de packs desde chat, decisión compartida con UI

Estado: implementado y comprobado localmente. Complementa ADR 011. El comerciante autorizó continuar por las etiquetas antes de guiones/conceptos.

Se reutilizan `pack_labels`, su forma de contenido, calculadora, revisión y mapping de Shopify. `get_pack_labels` expone contrato/estado/precios y `save_pack_labels` persiste una propuesta con snapshot de origen. No se llama IA ni se aprueba/publica por guardar. La propuesta no requiere fichas/avatares legacy.

Se extiende la tabla con origen/provenance/supersession; no se crea un segundo modelo de ofertas o páginas. Solo las decisiones humanas aprueban. UI y MCP comparten validación y RPC atómica, autorización y lock del producto. Etags incluyen el precio; una pantalla vieja no decide sobre otra propuesta o nuevos números. Las etiquetas forman parte del contexto operacional: un cambio incrementa revisión PI y deja snapshot/audit/receipt en la misma transacción. No-op conserva revisión/aprobación.

La duración requiere referencias explícitas a facts aprobados/verificados y sin contradicción, con cantidad/unidad presentes y múltiplos por unidades del pack. Se bloquea su consumo si cambian revisión/restricciones del respaldo, moneda o precios. La revisión humana sigue siendo necesaria para el significado del copy.

Se retira la generación independiente de etiquetas del servidor. El flujo legacy de estrategia permanece hasta migrar sus consumidores; su writer no puede reemplazar etiquetas de chat, incluso si ya estaba en vuelo. Los contenidos anteriores se pueden revisar/editar. Catálogo, Auth, Storage, calculadora, Shopify y Meta se conservan.

Consecuencia operacional: desplegar las cinco migraciones antes de este código. Para rollback, conservar un loader/editor que respete supersession; no volver al loader anterior sin adaptación. Guardar/eliminar propuestas no crea assets y mantiene las cascadas existentes.

Detalle, límites y pruebas: [pack-labels-mcp.md](../pack-labels-mcp.md). Guiones UGC, conceptos, planes de imágenes, eventos y WhatsApp permanecen pendientes. Producción no se modificó.
