# Migraciones PI aplicadas en producción

Autorización explícita del usuario: “Comitea tus cambios en main, pushea y luego aplica las migraciones en prod”. Esta autorización sustituye el límite previo de solo lectura para esta operación. Fecha: 2026-10-06; comprobación final 19:06 UTC / 16:06 America/Santiago.

Commit funcional `1322b293be9ad5f0b63e340018d5b29f7fa2e3f7`, en main y enviado a origin/main antes de aplicar SQL. El push incluyó también el commit previo `039dc28`, que aún no estaba en origin. Se conservaron sin seguimiento AGENTS.md y docs/auditoria-arquitectura-creativa.md, ajenos a la entrega.

## Operación comprobada

Proyecto vinculado `oukcswnfrzroxgwqmujf`. Preflight vía Management API de solo lectura: PostgreSQL 17.6, 36 versiones aplicadas y tablas/columnas OAuth requeridas disponibles. `supabase db push --linked --dry-run` identificó exactamente seis migraciones, sin seeds. Después del push se ejecutó `supabase db push --linked --yes`, con salida exitosa para:

- 20261102000000_product_intelligence_oauth.sql
- 20261103000000_product_intelligence_context.sql
- 20261104000000_product_intelligence_knowledge.sql
- 20261105000000_product_intelligence_landing.sql
- 20261106000000_product_intelligence_pack_labels.sql
- 20261107000000_landing_variants.sql

No se ejecutó reset, backfill ni restauración. Los campos añadidos usan los defaults del DDL; no se transformó el análisis legacy en conocimiento nuevo.

## Verificación posterior

`supabase migration list --linked`: las 42 versiones locales/remotas coinciden; última 20261107000000. Consulta independiente readonly: 27 tablas PI con RLS, nueve RPC principales con EXECUTE para service_role y sin EXECUTE para anon/authenticated; pi_mcp es NOLOGIN, sin superuser/BYPASSRLS ni membresía de authenticator.

Conteos antes/después iguales: products 8, product_pricing 5, pack_labels 9, page_components 116, copy_runs 11. Es una comparación agregada, no una prueba de igualdad byte a byte ni un snapshot global. [Evidencia agregada](production-migrations-2026-10-06.json), sin tokens ni payloads de clientes.

Antes del commit: 1.034 pruebas habituales aprobadas; las 65 pruebas transaccionales ya habían pasado contra Supabase local. Build/typecheck y checks documentados en el estado de implementación. Después de limpiar espacios en snippets se repitieron las pruebas habituales; no se ejecutaron fixtures de escritura de pruebas contra producción.

## Frontera posterior

La ejecución no cambió configuración hosted de OAuth/hook, flags MCP ni el tema de ninguna tienda. El push a main no confirma por sí solo el despliegue Vercel. Siguen pendientes la comprobación del host remoto y la actualización/publicación del kit Shopify compatible antes de publicar arrays: el guard del publicador exige ese tema. [Contrato y rollback](landing-variants-mcp.md), [runbook OAuth](oauth-runbook.md).

Rollback funcional conserva las nuevas tablas/columnas/RPCs e historia. Reducir o desactivar nuevas escrituras con código compatible, sin DROP ni reset. Para volver a un tema anterior, republicar primero el contenido default compatible y comprobar la tienda. No se ejecutó rollback en esta operación.
