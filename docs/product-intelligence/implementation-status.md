# Estado vigente

Extensión 2026-10-07: [PDP por ángulo](pdp-persuasion-audit.md) implementada y verificada localmente. Añade siete tools con flag, planes y experiencias; el catálogo derivado suma 36 contratos. Feature habilitada y migraciones aplicadas en producción: [registro de activación y límites](production-pdp-rollout-2026-10-07.md). [Validación y operación](pdp-persuasion-runbook.md).

Fecha: 2026-10-06. Contexto/precios, research, análisis, estrategia, landing/variantes, etiquetas, conceptos estáticos/chats creativos, galería, UGC, eventos, consejo WhatsApp, métricas Meta y aprendizajes están implementados. **29 tools anunciadas y 29 pares de contratos derivados**. Guardar propuestas no llama modelos ni publica.

## Retirada completada en código

Eliminados los handlers POST de redacción retirados, las rutas exclusivas de estrategia/confirmación, chat creativo y prompts, y el invocador de sondeo de estrategia sin uso. El contrato `generate_landing` desaparece del dominio, permisos, catálogo, ejemplos y schemas derivados. Se usan `save_landing_content` y `generate_gallery_images`.

Loaders, navegación, Meta, costos y QA de galería ya no consultan tablas de análisis retiradas. No se asigna origen canónico a medios históricos por slot o fecha. Se conservan páginas, packs, referencias, creativos, videos, campañas, métricas, costos y publicación. Anthropic permanece exclusivamente para QA visual opcional.

La migración `20261118000000` retira ocho tablas, tres columnas y una RPC de prompts. Aplicada en producción el 2026-10-07 tras respaldo y restauración de ensayo. Producción tiene 57 versiones aplicadas, incluidas las cuatro de PDP; los crons 20261119 siguen siendo una migración independiente pendiente. Se conservan las huellas de las 77 tablas públicas operativas. [Limpieza final y despliegue](retired-code-cleanup-2026-10-07.md), [evidencia productiva](production-legacy-cleanup-2026-10-07.json), [orden y rollback](migration-and-rollback.md).

## Verificación previa de esta limpieza (2026-10-06)

- TypeScript y **990 tests generales** pasan; 94 opt-in se ejecutaron aparte. La prueba SDK comprueba 29 tools; el nombre retirado ya no tiene contrato.
- Migración compilada en transacción local con rollback: ocho tablas y tres columnas ausentes; huellas de 20 tablas operativas conservadas (excluyendo run_id/product_data), con fixtures de página, etiquetas y costos. Snapshot operacional sigue disponible.
- Las cuatro clases de trabajos de análisis activos impiden la migración. Tres guardas se probaron contra las tablas originales; la cuarta rama se comprobó en una transacción aislada con las columnas de estado tras aplicar localmente.
- **307 tests PI**, incluidos los **94 transaccionales**, pasan contra el esquema limpio, con fixtures propios y limpieza.
- Chromium sobre Next real: 16 vistas (390/1280, claro/oscuro), WCAG 2.1 AA y sin desborde; OAuth, CAS, consejo aprobado, estrategia sin informe y 404/405 comprobados. Capturas inspeccionadas.
- ESLint de cambios, tokens, contratos y diff pasan. Build webpack termina con exit 0; conserva cinco diagnósticos anteriores HANGING_PROMISE_REJECTION de Ads/onboarding.
- En esta comprobación previa no se gastaron créditos, publicaron productos/campañas ni ejecutó la limpieza en producción. La ejecución productiva posterior está registrada arriba.

Los resultados cuantitativos finales se registran en [validación de limpieza](cleanup-validation.json). La prueba local no confirma despliegue Vercel, aceptación ChatGPT ni actualización del tema publicado.

## Pendientes reales

Ver [backlog vigente](implementation-backlog.md). La comprobación posterior al despliegue del 2026-10-07 confirma metadata pública MCP 200 y API PDP sin sesión 401 JSON, con ejecución `gru1::gru1` en discovery. No equivale a aceptación OAuth/tools con un comerciante ni a publicación Shopify.

Las entregas anteriores se consolidan en [historial](implementation-history.md).
