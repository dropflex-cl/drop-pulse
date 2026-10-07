# Migración y rollback vigentes

Las 52 migraciones hasta `20261117000000` están aplicadas en producción: [registro](production-content-migrations-2026-10-06.md). La contracción `20261118000000_retire_legacy_analysis.sql` está aplicada solo en local. Elimina datos de análisis retirado; no es una migración aditiva.

## Orden de despliegue

1. Guardar una exportación recuperable de las ocho tablas retiradas y de `products.product_data`, `ai_generations.run_id`, `pack_labels.run_id`, con IDs/dueños. Ver [inventario](legacy-text-retirement.md). Mantenerla fuera de Git y validar su restauración en ensayo.
2. Desplegar primero los lectores/handlers de esta limpieza, compatibles antes y después del DROP. Verificar listado/Hoy, contexto, selección, revisión de páginas/packs/creativos/videos, costos y operación Shopify/Meta. No desplegar el binario anterior después de contraer el esquema.
3. Esperar a que terminen invocaciones antiguas en vuelo y comprobar jobs de análisis `queued`/`running`. Conciliar explícitamente los activos; la migración los rechaza. No interrumpir campañas/jobs operativos conservados ni generar texto para completar el contexto.
4. Registrar conteos/huellas y aplicar únicamente la migración de contracción. PostgreSQL debe ejecutarla como transacción completa. No usar CASCADE, reset ni borrar Storage. Dependencias imprevistas deben abortar.
5. Verificar ocho tablas/tres columnas/RPC ausentes, huellas operativas preservadas, RPC PI, RLS/permisos y cascadas de producto. Aceptar recorridos reales de UI/MCP; confirmar deployment/crons aparte.

La prueba de esquema e integridad se ejecutó en local con fixtures y rollback antes de `migration up`; script `scripts/pi-cleanup-local.ts`, no admite destino remoto. Después se probaron las tools DB contra el esquema limpio. No constituye backup ni ensayo de restauración productivos.

## Rollback

Antes del DROP se puede volver a una versión compatible que ya tenga writers de texto retirados. Tras el DROP, mantener este binario compatible, apagar MCP/cron si hace falta y conciliar renders aceptados. Conservar contenido, costos, campañas, receipts, revisiones y auditoría.

Un rollback físico requiere recrear exactamente las ocho tablas/columnas/RPC a partir de las migraciones originales y restaurar la exportación validada en orden de FK. No existe downgrade automático que recupere filas eliminadas. No volver al binario que consulta tablas retiradas antes de terminar y verificar esa restauración. No reactivar generación pagada de texto.

Los rollbacks de OAuth y renders conservan sus límites: [OAuth](oauth-runbook.md#rollback-operativo), [UGC](ugc-chat-mcp.md), [galería/contenido](chat-content-and-learning.md). No modificar Auth/proxy para resolver un despliegue de esquema.
