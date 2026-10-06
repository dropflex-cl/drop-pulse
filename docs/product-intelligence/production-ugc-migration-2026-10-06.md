# Migración UGC aplicada en producción

Autorización explícita: “Comitea a main y pushea, si hay migraciones por aplicar, ejecútalas”. Proyecto vinculado `oukcswnfrzroxgwqmujf`. Fecha: 2026-10-06; comprobación final 20:19:59 UTC / 17:19:59 America/Santiago.

El commit funcional `bca07b0` quedó en `origin/main` antes de ejecutar SQL. `supabase db push --linked --dry-run` identificó únicamente `20261108000000_product_intelligence_ugc.sql`, sin seeds ni roles pendientes. `supabase db push --linked --yes` aplicó esa migración correctamente. `supabase migration list --linked` confirmó coincidencia de las 43 versiones locales/remotas, última `20261108000000`.

## Verificación independiente de solo lectura

Se consultó el endpoint Management API `database/query/read-only`, con `transaction_read_only=on`, antes y después. [Evidencia agregada](production-ugc-migration-2026-10-06.json), sin credenciales ni contenido de clientes.

- Los conteos se conservaron: products 8, product_pricing 5, pack_labels 9, page_components 116, copy_runs 11, video_scripts 9, video_shots 101 y ad_media 20. Las nueve filas de guion quedaron con source legacy, execution_key null y artifact_etag presente; sus estados conservan ocho succeeded y uno failed. Estos conteos no prueban igualdad byte a byte ni representan un snapshot global.
- pi_ugc_operations está vacía, con RLS y una política de lectura del dueño. authenticated solo puede leer; no puede insertar, actualizar ni borrar. anon no puede leer.
- Las 16 funciones nuevas existen. Las ocho RPC tienen EXECUTE exclusivamente para service_role entre los roles comprobados; las ocho funciones internas/trigger no permiten EXECUTE a service_role, anon ni authenticated. Ninguna de las 16 permite ejecución a anon/authenticated.
- Las seis FK de operaciones/relaciones de tomas están validadas y usan cascade. Los cuatro triggers están habilitados. Los dos índices parciales separan guiones legacy de ejecuciones del chat.

No se ejecutaron fixtures contra producción, reset, backfill, renders pagados ni publicaciones Shopify/Meta. Se conservaron sin seguimiento AGENTS.md y docs/auditoria-arquitectura-creativa.md, ajenos a esta entrega. Las 1.045 pruebas habituales, 79 transaccionales locales y build ya habían pasado antes del commit funcional.

## Pendientes operacionales

El push y la aplicación SQL están comprobados. La disponibilidad de la app/cron en Vercel, configuración hosted OAuth/MCP, actualización del tema Shopify y aceptación con ChatGPT/proveedor/tienda de ensayo requieren verificación posterior. Un push por sí solo no confirma el despliegue. El montaje sigue local.

Rollback funcional: desactivar nuevas generaciones, detener cron y conciliar trabajos externos; conservar esquema, historia, medios y lectores/revisión compatibles. No se ejecutó rollback. [Runbook](ugc-chat-mcp.md#despliegue-y-rollback).
