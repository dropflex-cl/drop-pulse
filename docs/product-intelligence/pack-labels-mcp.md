> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

# Etiquetas de packs escritas en chat

Implementación local. Se reutilizan `pack_labels`, el editor de Información base, la calculadora y el mapping de packs de Shopify. No hay tablas paralelas ni llamadas de IA, imágenes, publicación o Meta al consultar/guardar/decidir etiquetas.

## Contratos disponibles

- `get_pack_labels({ product_id })`: revisión PI, `pack_labels_etag`, plan físico guardado, propuesta vigente con origen/estado, flags `pricing_stale`/`evidence_stale`, hasta 50 facts utilizables dentro de 20 KiB, `duration_facts_has_more` para recuperar el resto con get_product_context paginado, contrato de etiquetas y reglas. No crea filas. El snapshot inicial completo se conserva en base; no se devuelve en cada lectura de propuesta.
- `save_pack_labels({ product_id, schema_version: "1.0", expected_revision, expected_pack_labels_etag, idempotency_key, dry_run?, labels, duration_fact_ids? })`: una etiqueta por cada pack calculado. Cada etiqueta conserva la forma `{ units, label, support, badge, basis, reason }` del editor; `support` y `badge` son nullable. Bases: duration/sharing/spare/gift/savings/other. No admite precios derivados, estados ni campos adicionales.

Se preservan los topes existentes: etiqueta 80 caracteres, apoyo 100, distintivo 30, un distintivo en un pack. `reason` se limita a 1.000 caracteres. El servidor devuelve las etiquetas en el orden del plan, sin cortarlas ni descartar entradas silenciosamente. La normalización de edición legacy del editor sigue vigente.

El MCP guarda propuestas `generated`, nunca aprueba. Un nuevo contenido reemplaza las filas activas con `superseded_at`, conservando su contenido/estado y el historial. Una carga idéntica con mismos precios, moneda y respaldo vigentes conserva la propuesta y su aprobación: no-op sin revisión ni audit nuevos. Una misma clave retorna el receipt original antes del CAS; cambiar su carga falla. `dry_run` no consume la clave ni escribe propuestas/revisiones/audit/receipts, ni entrega IDs nuevos.

## Respaldo y revisión

- Los montos se validan con las reglas compartidas de precios, contra el pack correspondiente; porcentajes contra su ahorro calculado. No se recalculan ni publican precios enviados por chat.
- Cantidad y unidad de duración deben aparecer en facts explícitos aprobados/verificados, sin evidencia contradictoria. `duration_fact_ids` referencia esos facts de este producto. Se admiten la duración por unidad y su múltiplo por las unidades del pack; no se infieren meses a partir de dosis/cápsulas ni del texto del proveedor. Los límites de cantidades pequeñas no eluden este requisito.
- Cantidades escritas solo con palabras no se aceptan como duración en esta primera versión. Usa una cantidad numérica respaldada o una etiqueta de compartir/regalo/repuesto. El validador reconoce días, semanas, meses, años y usos en los textos, también las unidades equivalentes en inglés de facts con valor numérico; no sustituye la revisión humana del significado de una afirmación.
- El contenido público rechaza HTML, palabras internas y las promesas prohibidas del validador existente, además de «tratamiento». La aprobación humana sigue siendo necesaria; no se afirma clasificación completa de todas las posibles promesas de salud.

Se guarda origen `mcp_chat`, actor, revisión de análisis y snapshot completo inicial, incluyendo precio y facts. Aprobar/editar registra los precios/moneda revisados y las revisiones de facts utilizadas, sin sustituir el snapshot de origen. Cambiar/revocar/eliminar un fact o aportar contradicción vuelve stale su respaldo. El loader común, los prompts conservados, la vista previa y el publicador no usan etiquetas aprobadas stale. Una nueva revisión humana vuelve a validar facts/precios actuales. Reabrir permite quitar la aprobación incluso si el respaldo fue revocado.

## Concurrencia y permisos

`pi_load_pack_labels`/`pi_commit_pack_labels` comparten autorización viva con el resto del MCP: dueño, scopes, bearer no caducado y grant/sesión vigentes. SQL reautoriza después del lock. Escritura MCP necesita `product_intelligence:write`; únicamente el actor merchant puede ejecutar approve/reopen/edit/edit_approve. El MCP anuncia solo consulta y propuesta.

La escritura bloquea el producto, compara revisión PI, etag de filas activas **y precio**, y stamp de snapshot. Propuesta/decisión, revisión/snapshot, audit y receipt se confirman juntos. Las decisiones UI envían el etag leído por la pantalla: no aprueban una propuesta nueva ni otro precio. Conflictos HTTP devuelven 409. Al guardar precio, la UI refresca también las etiquetas y su etag.

El trigger frena writes directos sobre propuestas de chat y sobre filas reemplazadas, y un writer legacy que llegue después de adoptar etiquetas MCP. El writer de estrategia viejo todavía existe como parte del retiro gradual; no puede reemplazar etiquetas MCP. El botón y el endpoint independientes «Otras etiquetas» se retiraron: POST responde 409 sin IA. La función de compatibilidad `regeneratePackLabels` también falla antes de llamar proveedores. Los contenidos legacy siguen visibles/editables/aprobables.

## Flujo

1. Guarda el contexto y Precio y packs por las tools existentes.
2. Consulta `get_pack_labels`. Escribe la propuesta en el chat usando los packs reales y, si corresponde, los facts de duración.
3. Valida con `dry_run: true`; guarda el batch con la misma revisión/etag y una clave de idempotencia.
4. Revisa/edita/acepta en Información base. La propuesta no necesita el cliente ideal ni Anthropic.
5. Recupera otra vez el contexto/estrategia antes de escribir landing/anuncios: las etiquetas aprobadas afectan la revisión PI y la vigencia de salidas dependientes.
6. Publica desde la UI usando el publicador existente. Ninguna tool de etiquetas publica Shopify o Meta.

## Migración y rollback

`20261106000000_product_intelligence_pack_labels.sql` extiende `pack_labels` con `source`, `provenance` y `superseded_at`; reutiliza heads/revisions/audit/receipts y cascadas existentes. Solo local. Aplicar OAuth → contexto → conocimiento → landing → etiquetas **antes** del código, incluso con MCP apagado: el loader/editor de etiquetas usa estas RPCs.

No crea archivos ni buckets; borrar el producto elimina propuestas y todas sus versiones por las cascadas existentes. El marcador de borrado impide nuevos writes y replay. No hubo backfill desde análisis legacy ni escrituras en producción.

Rollback funcional: apagar las nuevas tools y conservar RPCs, columnas y loader/revisor compatibles con `superseded_at`; no volver directamente al loader anterior que ignoraba supersession. No hacer DROP de datos/historia. Para restaurar una propuesta, enviar su contenido como una propuesta nueva, con CAS y revisión humana; no actualizar una fila reemplazada directamente.

Verificación: 11 tests puros/servicio, 14 de integración local (CAS concurrente, replay/no-op/dry-run, permisos/ACL, decisiones UI, respaldo stale, historial/rollback/cascadas, discovery y SDK). La prueba nativa OAuth/HTTP existente incluye lectura/escritura/replay, bearer caducado y grant revocado de etiquetas. Los fixtures usan usuarios propios y guard exacto `http://127.0.0.1:55321`. No se probó conexión de ChatGPT remoto ni publicación real.
