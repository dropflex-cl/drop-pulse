# Migraciones de contenido y aprendizaje aplicadas en producción

Aplicación autorizada expresamente por el comerciante, 2026-10-06. Proyecto vinculado `oukcswnfrzroxgwqmujf`. El commit funcional `8531956` quedó en `origin/main` antes de ejecutar SQL.

`supabase db push --linked --dry-run` identificó exactamente nueve migraciones, sin seeds ni roles adicionales. `supabase db push --linked --yes` terminó correctamente y aplicó:

- `20261109000000_product_intelligence_content.sql`
- `20261110000000_product_intelligence_learning.sql`
- `20261111000000_product_intelligence_content_review.sql`
- `20261112000000_product_intelligence_render_guards.sql`
- `20261113000000_product_intelligence_gallery_operations.sql`
- `20261114000000_gallery_claim_snapshot.sql`
- `20261115000000_creative_execution_provenance.sql`
- `20261116000000_learning_evidence_references.sql`
- `20261117000000_content_dispatch_context.sql`

## Comprobaciones

`supabase migration list --linked` confirmó coincidencia de las **52 versiones locales/remotas**, última `20261117000000`. Consultas SELECT vía Management API antes/después comprobaron:

- Igualdad de conteos y huellas agregadas de filas en 15 tablas de negocio. La comparación excluye las claves `content_provenance`, `pi_operation_id` y `provenance`, para comparar el material existente sin las columnas nuevas. No equivale a un snapshot global ni a una comparación de esas claves excluidas.
- Dos tablas nuevas con RLS: aprendizaje tiene solo política SELECT del dueño; la cola de galería no tiene políticas de cliente. Supabase conserva sus grants predeterminados de SELECT para anon, pero RLS no le permite acceder a filas; las RPC restringidas proyectan el estado autorizado.
- Trece RPC con EXECUTE de service_role y sin EXECUTE de anon/authenticated; ocho helpers sin EXECUTE de clientes.
- Siete triggers activos y cuatro FK nuevas validadas con cascada.
- Recibos admiten los seis comandos nuevos de escritura/render y el trigger congela la imagen base.
- Tablas nuevas vacías: no se crearon fixtures ni trabajos ni aprendizajes en producción.

[Evidencia agregada sin credenciales ni contenidos](production-content-migrations-2026-10-06.json). No se hicieron llamadas pagadas ni publicaciones Shopify/Meta.

## Estado operacional

Commit, push y migraciones están comprobados. La metadata pública MCP consultada después del push todavía responde HTTP 404. Ese resultado no confirma el estado completo del despliegue Vercel; sigue pendiente configurar/verificar discovery OAuth/MCP y aceptar el recorrido real desde ChatGPT/proveedor/tienda de ensayo. No se cambiaron variables de entorno ni el tema publicado.

Rollback operacional: desactivar MCP/cron de galería, conciliar pedidos externos ya aceptados y conservar esquema, historia y lectores compatibles. No se ejecutó rollback. [Runbook y límites](chat-content-and-learning.md#despliegue-y-rollback).
