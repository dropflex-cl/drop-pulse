# Limpieza del análisis retirado

Estado: writers y rutas retirados; limpieza final de builders/adaptadores implementada y desplegada. La contracción productiva se aplicó el 2026-10-07 con respaldo y restauración de ensayo comprobados. [ADR 017](adrs/017-remove-retired-analysis.md), [ejecución y evidencia](retired-code-cleanup-2026-10-07.md), [rollout](migration-and-rollback.md).

## Rutas e invocadores

Eliminadas las rutas `/api/products/[id]/strategy`, `/strategy/confirm`, `/creatives/chat` y `/api/settings/prompts/[key]`/`activate`. Se elimina su cliente de sondeo y el helper `retiredProductWriter`.

Eliminados los POST de generación en `/product-data`, `/copy`, `/creatives`, `/page-images`, `/whatsapp/tip`, `/pack-labels`, `/videos` y `/api/events/[slug]/copy`. Las rutas mixtas conservan GET/PUT/PATCH/DELETE que sirven lectura, edición, render o decisión humana. Un método eliminado queda sin handler (405 en Next); una ruta exclusiva eliminada ya no existe (404). No se mantiene la compatibilidad 410.

`generate_landing` se elimina por completo; el cliente debe guardar con `save_landing_content` o iniciar imágenes con `generate_gallery_images`. El SDK rechaza el nombre desconocido como error de protocolo. PDP añade siete tools al catálogo anterior: 36 con la feature encendida.

## Esquema eliminado por la migración

| Objeto | Motivo |
|---|---|
| pipeline_runs, product_briefs, customer_avatars | Pipeline de ficha/cliente ideal retirado |
| angle_rankings, angle_briefs | Orquestador, desarrollos y hooks retirados |
| strategy_runs, prompt_templates | Informe/extracción y prompts pagados retirados |
| product_competitors | Análisis de competencia retirado; investigación explícita va a fuentes PI |
| products.product_data | Datos del identificador antiguo; contexto actual en pi_product_inputs |
| ai_generations.run_id, pack_labels.run_id | Relaciones exclusivas al pipeline retirado |
| activate_prompt_template(uuid) | Activación de prompts sin consumidor vigente |

Sin `DROP ... CASCADE`: dependencias imprevistas abortan la migración. Trabajos de análisis activos también la impiden. Los enums `sales_angle` y `pipeline_run_status` siguen usados por contenido operativo y no se eliminan. Migraciones históricas se conservan para construir bases nuevas.

## Consumidores y contenido conservado

Se eliminaron stores/lectores de análisis, informe UI y esquemas de extracción, mantenimiento de strategy_runs, contador de jobs de análisis, métricas de hooks basadas en angle_briefs y comparadores de contenido stale contra fichas/avatares retirados. Se retiraron react-markdown/remark-gfm, usados solo por el informe.

La limpieza final elimina los esquemas de ficha/avatar/router/brief, lectores de avatares, contexto de prompts, generador/selector de hooks, builder holgado de la llamada única de página y reparación automática por partes. No tenían consumidores fuera de sus propios tests o adaptadores también retirados. Las etiquetas conservan exactamente su contrato en `lib/pricing/labels-schemas.ts`; el diferenciador confirmado tiene un schema puro en `lib/products/differentiator-schema.ts`. Las huellas que aún comparan campañas se conservan en `lib/angles/stamps.ts`. Los límites y el contador de palabras de videos viven en su catálogo.

Los validators de página/consejo/video, los objetos y variantes de contenido guardado, los snapshots históricos, el fallback Shopify y los steps históricos de costos siguen vigentes. Las funciones SQL internas `pi_commit_landing_legacy` y `pi_commit_learning_legacy` implementan los writers actuales a través de wrappers; no son código muerto y no se eliminan.

Información base lee el contexto canónico; sin él pide completarlo explícitamente. No importa nombre/descripción del análisis antiguo. El diferenciador confirmado por el comerciante conserva su edición; no toma propuestas de fichas. Navegación depende de contexto/precio y selección PI, no de aprobación de avatares o dos briefs.

Meta toma defaults de la selección lista y compara provenance por strategy_id/angle_id. Medios sin provenance mantienen origen desconocido; no se reatribuyen por fecha o slot. Los guards de publicación existentes siguen vigentes.

QA de galería lee hechos verificados del snapshot del plan chat. Para tomas históricas sin contexto verifica imagen base y textos pedidos sin inferir funciones/accesorios; no consulta product_briefs. Los proveedores y la revisión humana se conservan.

No se borran rows ni archivos de páginas, creativos, videos, packs, reseñas, pricing, catálogo, campañas/publicaciones ni ai_generations. Los inputs JSON históricos de esos artefactos pueden conservar UUIDs/texto de su contexto original; son snapshots históricos, no relaciones activas ni conocimiento importado. Limpiarlos destruiría provenance sin mejorar aislamiento.

## Verificación y límites

TypeScript, tests HTTP/SDK, dominio y DB local; prueba inicial de integridad y contracción de 20 tablas con rollback. [Resultados previos](cleanup-validation.json). La limpieza final añade restauración del respaldo productivo en ensayo, despliegue Vercel exitoso y DROP productivo con huellas de 77 tablas conservadas sin cambios: [resultado vigente](retired-code-cleanup-2026-10-07.md). No se ejecutaron renders pagados ni publicaciones reales.
