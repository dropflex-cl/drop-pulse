# Retirada de QA pagado en MCP y skill · 1.6.4

El 2026-10-11 se actualizaron las instrucciones MCP y `optimize-product` para completar la retirada de la revisión automática pagada de imágenes. La inspección visual del resultado conserva su utilidad editorial; un fallo no autoriza generar otra imagen, descartar la pieza ni cambiar sus usos. Estas operaciones requieren un pedido explícito del comerciante, aun con autorización para el lote o la publicación automática en Shopify.

Se eliminaron las instrucciones de corregir tomas automáticamente dentro del pedido original y se corrigieron las referencias a QA opcional, cobros de Anthropic y el campo QA de `pi_gallery_operations`. El servidor ya no expone los campos ni ejecuta el QA retirado. `get_visual_comparison` y `review_visual_record` conservan sus lecturas y decisiones explícitas; no evalúan imágenes con modelos ni regeneran piezas.

Plugin privado actualizado con Plugin Creator sobre el mismo ID y release anterior como control de concurrencia. El readback verifica los once archivos: cambian los dos manifiestos, la skill y su referencia de producción; conexión, ebook, hooks, presentación, permisos y audiencia permanecen iguales. [Registro del release](plugin-qa-retirement-1.6.4.json).

Validación: 34 pruebas de MCP/HTTP/skills y lint correctos. El recurso MCP servido exige un pedido explícito antes de regenerar o descartar; importar la skill no ejecuta tools de generación. No se ejecutaron generaciones pagadas, publicaciones de productos ni campañas. No hay migración adicional. El comportamiento en una conversación nueva del host no se probó.
