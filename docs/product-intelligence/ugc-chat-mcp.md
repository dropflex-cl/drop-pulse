# UGC desde el chat

Implementación en código y Supabase local. Por autorización posterior, el commit `bca07b0` se envió a main y la migración `20261108000000_product_intelligence_ugc.sql` se aplicó y verificó en producción el 2026-10-06: [registro y evidencia](production-ugc-migration-2026-10-06.md). Los renders de prueba son simulados; no hubo consumo de Higgsfield/Anthropic ni publicaciones en Shopify/Meta. Verificación hosted y actualización del tema pendientes.

## Flujo operativo

1. Recupera `get_product_context` y `get_product_strategy`. Confirma precio, base, evidencia y estrategia antes de proponer un video. Una selección sigue siendo una hipótesis.
2. Consulta `get_ugc_content` con `include_contract: true`. Escribe guion y plan en el chat siguiendo `lines` y `plan` del formato elegido: persona (`ugc`) o mascota (`mascot`). El servidor arma K1 y las claves A/B; valida apertura, duración, montos y restricciones existentes.
3. Envía `save_ugc_content` primero con `dry_run: true`, revisión y `expected_ugc_etag`. Guarda con una clave idempotente. Usa `angle_slot` según el orden de ángulos seleccionados (principal = 1), un `execution_key` por combinación creativa y los mismos `landing_angle_id`/`landing_hook_id` que usarás en la landing. Otro formato conserva una propuesta independiente.
4. En Creativos > Videos, pulsa **Actualizar guiones**, revisa y aprueba. Guardar desde MCP no aprueba, genera ni publica. La redacción de guiones por API se retiró: POST Videos devuelve 410 sin IA.
5. Recupera el guion por `script_id`, con su `artifact_etag`. `generate_ugc` admite exclusivamente `keyframes` o `clips`, con `shot_keys` explícitas. `dry_run` valida y estima sin proveedores. K1 define el personaje; los clips requieren todas las imágenes clave aprobadas. Puedes iniciar los mismos renders desde la UI.
6. Consulta `get_generation_status`: lee la cola persistida, no llama al proveedor. Revisa las imágenes en la UI. Higgsfield usa la clave del comerciante. El QA de imágenes usa Anthropic únicamente si se habilitó esa opción; en guiones del chat, un fallo de QA requiere un nuevo intento explícito, sin render automático adicional.
7. `get_ugc_montage` devuelve el paquete v2 con URLs de 24 horas. El montaje sigue en `scripts/ugc-montage.py`, fuera de Vercel. Descarga otra vez el paquete si vence; eso no genera nuevos clips. Los nombres incluyen la ejecución para distinguir hooks del mismo ángulo.
8. Sube un MP4 vertical 9:16, de 10–60 segundos y hasta 100 MB. Revísalo y apruébalo en la UI. Solo entonces se puede usar en Anuncios o en la landing. Descartar conserva el archivo para **Deshacer**; reemplazar o eliminar el producto lo limpia.
9. Consulta los `script_id` de videos finales aprobados con `get_ugc_content`. En `save_landing_content`, envía `ugc-slider.content.script_ids`, hasta diez IDs por variante, en orden. Captions describe cada video en ese mismo orden. La UI muestra nombres, permite seleccionarlos y marca referencias retiradas. Ningún UUID o URL de Storage se publica en los textos de Shopify.
10. Publicar copia los MP4 aprobados a Shopify Files con staged upload VIDEO y espera READY. La caché conserva el GID antes del polling para reutilizarlo en un nuevo intento. `ugc_videos_variants` contiene el pool y cada variante sus índices ordenados. Sin selector válido se usa default; una variante sin videos no hereda material de otro hook.
11. Cada anuncio UGC incluye `df_angle` y `df_hook` en su destino, conservando UTMs. Mezclar videos de diferentes combinaciones en un mismo anuncio exige separarlos. Antes de crear objetos de Meta, se comprueba aprobación, contexto vigente y que el medio sea la copia del montaje actual. No modifica campañas ya lanzadas.

## Contratos y límites

| Tool | Permiso | Efecto |
|---|---|---|
| `get_ugc_content` | read | Resumen paginado; `script_id` incluye guion y tomas; contrato opcional. |
| `save_ugc_content` | read + write | Propuesta versionada, CAS, revisión, audit y receipt en una transacción. |
| `generate_ugc` | read + ugc:generate | Cola atómica de las tomas solicitadas; puede gastar créditos al ejecutarse. |
| `get_generation_status` | read | Estado y costo estimado, cursor ligado al estado; sin polling externo. |
| `get_ugc_montage` | read | Paquete del guion vigente, aprobado y con clips completos. |

Un [ejemplo completo de guion y plan](contracts/ugc.example.json) contiene datos ficticios y requiere sustituir IDs/revisión/etags por los leídos de las tools.

Los schemas publicados salen de `lib/product-intelligence/ugc-schemas.ts` y `schemas.ts`. El runtime y catálogo derivado actuales tienen 29 tools; el contrato retirado ya no existe. `contracts/tools.json` conserva el subconjunto histórico de nueve tools aún vigentes, no discovery del host.

Un guion/plan del chat admite hasta 20 KiB. La lectura resumida pagina 12 ejecuciones por defecto, hasta 24; `script_id` recupera detalle. Se permiten 24 guiones activos del chat por producto. El cupo de render conserva 60 imágenes y 40 clips por comerciante en 24 horas, reservado bajo bloqueo compartido entre productos. Los costos de Higgsfield son estimaciones, no facturas del proveedor.

## Persistencia, concurrencia y conciliación

Se reutilizan `video_scripts`, `video_shots`, `creative-media`, `ad_media`, `ad-media`, `page_components`, `shopify_files` y el publicador existente. `pi_ugc_operations` agrega la cola durable, con RLS de dueño y relaciones compuestas entre operación, guion, producto y usuario. Todas las nuevas filas hacen cascade hacia el producto; los archivos usan sus prefijos existentes y `deleteProducts` los limpia con Storage primero.

La escritura congela estrategia, revisión de análisis, mercado, precio, etiquetas aprobadas e ID de imagen base. Su stamp incorpora contexto, referencias y opción de QA. El worker revalida autorización, stamp y versión antes del submit. Un marcador persistido `dispatching` impide dos submits concurrentes; cron recupera trabajo interrumpido cada cinco minutos. Estado MCP no despierta renders.

Si un submit pierde su respuesta, la toma queda `dispatch_unknown`, sin reintento ciego. La UI permite pegar un identificador de trabajo existente: el servidor consulta Higgsfield con la clave del comerciante y continúa polling sin nueva generación. Alternativamente, el comerciante puede marcar **Ya revisé Higgsfield y este trabajo no existe** y **Habilitar otro intento**; esto solo libera el bloqueo. Generar de nuevo sigue siendo una acción aparte y pagada. Antes de escribir los captions y el título, confirma que describen una demostración y no presentan al actor generado como comprador. Una caída entre aceptación externa y persistencia no ofrece exactly-once del proveedor: exige esta conciliación explícita.

Guion, decisiones de imágenes y montaje tienen CAS. No se cambia contenido mientras se generan tomas. Editar guion invalida clips y final; retirar/reabrir una imagen aprobada invalida sus clips y montaje. Subir/aprobar el final usa un lease y hashes de guion/tomas. Un archivo anterior no vuelve a aprobarse tras una edición sin montar y subir de nuevo. Cambios del contexto requieren una propuesta nueva desde el chat. Reemplazar una ejecución conserva la versión anterior; el estado de sus operaciones sigue consultable.

## Despliegue y rollback

1. Aplicar la migración UGC después de las migraciones PI anteriores (incluida `20261107000000`). Verificar ACLs: RPCs solamente service_role, lectura de dueño en cola, FK compuestas y cascadas. El código de UI también usa columnas/RPCs nuevas: la migración precede a la app aunque MCP esté apagado.
2. Desplegar la app en `gru1`, con el mismo Supabase, claves de cada comerciante y `CRON_SECRET`. La migración `20261119000000_media_recovery_crons.sql` programa `/api/cron/ugc` y `/api/cron/gallery` cada cinco minutos en Supabase, reutilizando `app_base_url` y `cron_secret` de Vault. `vercel.json` conserva solo el cron diario de conexiones, compatible con Hobby. [Activación y comprobación](oauth-runbook.md#recuperación-de-videos-y-galería). No poner claves de proveedores del servidor como fallback.
3. Actualizar el kit/tema Shopify desde las fuentes generadas y verificar el tema publicado. Probar un producto de tienda de ensayo: default, ángulo, hook, vacío, orden, captions, reproducción y checkout.
4. Verificar OAuth/MCP hosted con un cliente real. Para un smoke test pagado, el comerciante aprueba un guion y solicita explícitamente una sola imagen; después comprobar cola, revisión, paquete, subida, aprobación y publicación en tienda de ensayo. Este smoke test no se ejecutó aquí.

Rollback funcional: deshabilitar `generate_ugc`, detener el cron y esperar/conciliar trabajos ya enviados antes de retirar workers. Conservar esquema, receipts, versiones, medios y funciones de revisión compatibles; no volver al índice que permitía un solo video por ángulo/formato ni eliminar historia. Si se vuelve al tema anterior, republicar contenido compatible antes de retirar pools por variante. No reactivar writers de texto como fallback. No hacer DROP de datos como rollback ordinario.

La instalación completa se comprobó en una transacción local que terminó en ROLLBACK. Las pruebas locales usan usuarios ficticios y URL exacta `http://127.0.0.1:55321`; no reinician la base. Las pruebas cubren permisos, aislamiento, guardado/replay/CAS, cola, submit simulado, conciliación, lease del final, referencias y invalidación. Chromium renderiza los Liquid reales para verificar selección y orden. Los adapters de filtros exclusivos de Shopify no sustituyen la verificación remota.
