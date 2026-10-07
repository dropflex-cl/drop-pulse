# Product Intelligence MCP

El chat escribe investigación, hipótesis, estrategia y contenido. DropFlex valida y persiste esas propuestas, permite revisión humana y ejecuta imágenes/video con los proveedores del comerciante. UI y MCP comparten dominio, precios, permisos y reglas de vigencia. Seleccionar una estrategia no demuestra que sea ganadora.

Flujo: **Research → Strategy → Execution → Performance → Learning → Strategy**.

## Documentación vigente

- [Estado y verificación](implementation-status.md): implementación actual y límites comprobados.
- [Backlog](implementation-backlog.md): pendientes actuales, sin paquetes ya completados.
- [Contratos MCP](mcp-contracts.md): 29 tools base y siete adicionales con flag para PDP; [schemas derivados](contracts/README.md).
- [PDP por ángulo: auditoría](pdp-persuasion-audit.md), [ADR 018](adrs/018-angle-driven-pdp.md) y [runbook](pdp-persuasion-runbook.md): planes, experiencias, compatibilidad y rollout piloto.
- [Limpieza de análisis retirado](legacy-text-retirement.md) y [ADR 017](adrs/017-remove-retired-analysis.md): rutas, invocadores, tablas y compatibilidad operativa.
- [Migración y rollback](migration-and-rollback.md): orden de despliegue para la contracción del esquema.
- [OAuth](oauth-runbook.md), [contenido/aprendizaje](chat-content-and-learning.md), [UGC](ugc-chat-mcp.md) y [variantes Shopify](landing-variants-mcp.md): contratos y operación específicos.
- [Dominio compartido](../../lib/product-intelligence/README.md): módulos y verificaciones.

## Producción y evidencia histórica

Las 52 migraciones hasta `20261117000000` están comprobadas en producción. [Registro de contenido](production-content-migrations-2026-10-06.md), [UGC](production-ugc-migration-2026-10-06.md) y [primera puesta de esquema](production-migrations-2026-10-06.md).

La limpieza `20261118000000` está aplicada y probada **solo localmente**. Requiere desplegar primero los lectores compatibles y exportar el análisis que se elimina antes de aplicarla en producción. La conexión pública ChatGPT/MCP y el tema publicado aún requieren aceptación real.

[Auditoría baseline](audit-current-model.md), [matriz de reutilización](reuse-matrix.md), [mapping de diseño](target-model-mapping.md), [ADRs](adrs/001-storage-and-ownership.md) e [historial](implementation-history.md) conservan la evidencia y evolución; no sustituyen el estado vigente. El [spec recibido](spec-product-intelligence-mcp.md) se conserva sin modificaciones.
