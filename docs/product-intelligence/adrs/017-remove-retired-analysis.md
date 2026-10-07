# ADR 017: eliminar endpoints, contrato y esquema de análisis retirados

Estado: aceptado por petición del comerciante; implementado, desplegado y con contracción productiva aplicada el 2026-10-07 tras respaldo y restauración de ensayo. [Registro](../retired-code-cleanup-2026-10-07.md). Sustituye la compatibilidad 410 de ADR 015 y el contrato cerrado generate_landing de ADR 016.

Eliminamos handlers/invocadores de writers ya retirados y el contrato generate_landing. Rutas mixtas conservan lectura, revisión y render; rutas exclusivas desaparecen. No añadimos aliases de generación pagada.

La migración elimina ocho tablas de análisis/prompts/competencia, tres columnas exclusivas y la RPC de prompts. Sin CASCADE y con guard de trabajos activos. Se conservan artefactos operativos, precios/packs, Storage, catálogo, Auth, Shopify/Meta, costos y JSON histórico. Los lectores y navegación usan contexto/selección PI; Meta compara identidades de provenance, sin asignar origen a medios antiguos por fecha/slot.

Se mantiene el diferenciador confirmado por el comerciante y el QA visual opcional. Las tomas históricas sin facts hacen revisión de imagen base/textos sin consultar análisis eliminado. Los enums de tipo compartidos por renders se conservan.

Una migración de contracción exige desplegar lectores compatibles primero y una exportación restaurable. Rollback funcional conserva ese binario; rollback físico necesita recreación y restauración comprobadas. No hay recuperación automática de análisis borrado. [Runbook](../migration-and-rollback.md), [inventario](../legacy-text-retirement.md), [verificación](../implementation-status.md).
