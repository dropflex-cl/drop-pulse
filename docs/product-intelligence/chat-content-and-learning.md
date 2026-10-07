# Cierre de contenido y aprendizaje desde chat

Estado vigente: código implementado y verificado localmente, comiteado y pusheado a main (`8531956`). Las migraciones `20261109000000` a `20261117000000` se aplicaron y verificaron en producción por autorización explícita posterior: [registro](production-content-migrations-2026-10-06.md). Despliegue de la app y host ChatGPT pendientes de verificación; no se publicaron productos/campañas ni se gastaron créditos externos.

El runtime anuncia 29 tools, con 30 pares de contratos derivados. `generate_landing` conserva su contrato histórico cerrado: la página se escribe con `save_landing_content` y sus imágenes se ejecutan con `generate_gallery_images`. Ninguna tool de guardado redacta con modelos ni inicia renders.

## Cobertura nueva

| Tools | Persistencia reutilizada | Resultado |
|---|---|---|
| `get_creative_content`, `save_creative_content` | `creative_runs`, `creative_concepts` | Conceptos, textos finales, dirección de arte y conversaciones dramatizadas listos para revisar/renderizar. |
| `get_gallery_content`, `save_gallery_content` | `page_image_runs`, `page_image_shots` | Plan de nueve tomas: portada, cinco galería y tres beneficios. |
| `get_event_content`, `save_event_content` | `event_copy` | Propuesta para un evento publicado del calendario; no activa ni publica la campaña. |
| `get_usage_tip`, `save_usage_tip` | `products.usage_tip` | Consejo fundamentado en hechos verificados; requiere aprobación humana antes de aparecer en mensajes operativos. |
| `generate_gallery_images`, `get_gallery_generation_status` | `page_images`, nueva `pi_gallery_operations` | Cola durable sobre render/Storage existentes, con permisos y estimación explícitos. |
| `get_product_performance` | `ad_campaigns`, `ad_insights_daily` | Métricas diarias de campañas del producto, separadas por moneda/zona horaria. |
| `get_product_learning`, `save_product_learning` | Nueva `pi_product_learnings` | Hipótesis, criterio, observación, resultado, limitaciones y siguiente acción con medición inmutable. |

Los contratos JSON completos salen de `npm run pi:contracts`. Las tools `get_*_content` devuelven el contrato específico, la propuesta actual, `revision`, `content_etag` y reglas. Las lecturas de listas paginan con `has_more`/`next_cursor`; hay que recuperar todas las páginas antes de reemplazar un plan. Un cursor de contenido cambiado se rechaza. Aprendizajes paginan con `before_revision`.

## Recorrido operativo

1. Recuperar `get_product_context` y `get_product_strategy`. Guardar nombre, descripción, texto del proveedor, precio y supuestos con `save_product_context`. Los números derivados los calcula el SaaS.
2. Research conserva fuentes/hechos por separado de análisis e hipótesis. Verificar exige su permiso específico. Seleccionar una estrategia crea una decisión inmutable; no declara un ganador.
3. Escribir en el chat conceptos/arte/conversaciones, plan de imágenes, landing por componentes, guion/plan UGC y etiquetas de packs. Consultar el contrato de cada tool; validar con `dry_run`, guardar con revisión/etag leídos y clave idempotente.
4. Para estáticos/galería, `angle_ids` contiene **todos** los ángulos seleccionados, en su orden, hasta tres. Cada concepto apunta a su UUID canónico y lleva `landing_angle_id`/`landing_hook_id` iguales a los selectores de las variantes de landing. Estos selectores son slugs, no UUID del análisis.
5. Revisar y generar imágenes en DropFlex, o pedir `generate_gallery_images` con IDs de tomas, proveedor, revisión, etag y límite de estimación. UGC mantiene sus tools de render/montaje. Render usa la imagen base, el proveedor del comerciante y QA opcional.
6. Aprobar piezas y publicar con los flujos Shopify/Meta existentes. Los estáticos conservan procedencia y usan `df_angle`/`df_hook` en el destino, preservando UTM; mezclar destinos distintos en un mismo anuncio se rechaza.
7. Consultar métricas en una ventana de hasta 90 días. Escribir el aprendizaje desde el chat, validarlo y guardar con `expected_performance_etag` y revisión actuales. Se conserva la medición exacta, sin doble suma de campaign/adset/ad.
8. Recuperar aprendizajes y, si corresponde, citarlos como `Source.internal_ref = { kind: "product_learning", id }` al guardar research. Refinar análisis y seleccionar explícitamente la siguiente estrategia. El aprendizaje no modifica la selección automáticamente.

## Concurrencia, costes y borrado

Cada guardado confirma propuesta, revisión, historial/auditoría y recibo en una transacción. Replay autorizado ocurre antes de CAS; cambiar el contenido con la misma clave se rechaza. Guardar una propuesta nueva conserva versiones anteriores y assets aprobados. Eventos actualizan la propuesta del evento concreto; el contenido previamente publicado sigue en Shopify hasta una nueva publicación.

Nombre/descripción y texto del proveedor en Información base usan el mismo `save_product_context`. El navegador envía la revisión del contexto básico observado; el servidor la comprueba y usa CAS global para la transacción. Cambios de precio independientes no invalidan el formulario; cambios concurrentes del chat sí. Vaciar el texto del proveedor guarda `null`, sin reaparecer desde `products.base_info`. El legado se muestra solo cuando todavía no hay contexto canónico.

El estado de Estrategia en la navegación y los slots de Creativos salen de la selección canónica. La galería conserva su mundo visual y valida estrategia/contexto antes de renderizar. La autorización de la cola MCP se vuelve a verificar al despachar; revocación, borrado o contexto cambiado cancelan lo que no se envió.

La estimación de galería reserva 2× el precio nominal por toma. **No es un límite contractual de facturación del proveedor**; QA usa Anthropic aparte si el comerciante lo activó. No hay corrección/reenvío automático por QA en esta operación MCP. Una respuesta de envío ambigua queda `reconciling`: no se repite automáticamente. El cron continúa consultando pedidos ya aceptados y detiene lo pendiente de esa operación. Tras confirmar el estado en el proveedor, una nueva solicitud explícita puede generar las tomas faltantes con una clave nueva; no hay búsqueda automática de un request ID perdido.

Los renders de UI también comprueban la vigencia del plan y la imagen base antes de llamar al proveedor. La comprobación no puede cancelar una solicitud externa que ya fue aceptada. El borrado reutiliza `deleteProducts`: pausa campañas, Storage primero y luego cascadas de producto. Las nuevas tablas cuelgan del producto; no se creó otro bucket.

## Alcance comprobado de métricas

`get_product_performance` consulta únicamente la caché existente de Meta; no fuerza una sincronización ni hace llamadas a Meta. Cada grupo informa `last_synced_at` y días con datos. Se separan monedas; compras de Meta no equivalen a pedidos confirmados, entregados o cobrados COD. `cod` devuelve `null`: no hay una fuente de cobros COD integrada y comprobada que permita poblarla.

La atribución es `product_campaigns_only`. La selección actual no se aplica retrospectivamente a campañas históricas. Las métricas no prueban causalidad por ángulo/hook. El chat documenta limitaciones y criterios; no se guarda un resultado concluyente sin ningún día medido. Atribución experimental individual y datos COD requieren su fuente y diseño propios.

## Despliegue y rollback

Aplicar las nueve migraciones nuevas en orden antes de desplegar los loaders/writers nuevos. Registrar versiones y comprobar RLS, permisos RPC, cascadas y funciones; primero hacerlo en un entorno de ensayo. No resetear la base ni ejecutar backfill de análisis retirado.

Configurar `MCP_ENABLED=true`, `MCP_RESOURCE_URL=<APP_URL>/api/mcp`, `MCP_ALLOWED_ORIGINS`, OAuth nativo y redirect/consentimiento de Supabase. Conservar `gru1` y Supabase `sa-east-1`. `CRON_SECRET` autentica `/api/cron/gallery` y `/api/cron/ugc`; la migración `20261119000000_media_recovery_crons.sql` programa ambos cada cinco minutos en Supabase. Reutilizan los secretos `app_base_url` y `cron_secret` de Vault del job de métricas; `vercel.json` conserva únicamente conexiones diario. [Activación y comprobación](oauth-runbook.md#recuperación-de-videos-y-galería).

La inspección pública de esta entrega recibió HTTP 404 en la metadata MCP de Vercel y en el endpoint OAuth consultado del proyecto vinculado. Esto no confirma que falten todas las capacidades OAuth; confirma que el discovery público probado no está disponible. No se probó una conexión real de ChatGPT.

Aceptar en ensayo: discovery, consentimiento/scopes/revocación, reconstrucción desde un chat nuevo, propuesta → revisión, un render explícito por proveedor, replay sin segundo gasto, cron después de interrupción, borrado y readback Shopify/Meta. Verificar el tema publicado con/sin `df_angle`/`df_hook`, incluidos defaults. Solo después aceptar el rollout.

Rollback operacional seguro: desactivar MCP y el cron de galería, dejar terminar/conciliar pedidos externos ya enviados y mantener una versión compatible para lectura/revisión. Antes de volver a un binario anterior, comprobar que sus lectores admiten los nuevos payloads y que sus writers no vuelven a escribir campos legacy sobre contexto canónico; no se verificó esa reversión binaria en esta entrega. Conservar tablas/columnas/migraciones y piezas guardadas; no borrar datos ni reactivar writers pagados. Una reversión física de esquema exige inventario/exportación y prueba de dependencias, fuera del rollback operacional.

Decisiones: [ADR 016](adrs/016-chat-content-learning-and-render.md). Estado y resultados: [implementation-status.md](implementation-status.md).
