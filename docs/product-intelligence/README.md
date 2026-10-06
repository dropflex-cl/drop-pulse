# Estado vigente: contenido y aprendizaje implementados

Completadas las tools de conceptos/dirección de arte/conversaciones, planes de galería, eventos, consejos WhatsApp, render de galería y performance/aprendizaje persistentes. Información base y navegación leen el contexto/selección canónicos; los estáticos conservan selectores de landing en Meta. **29 tools anunciadas, 30 contratos derivados**. [Recorrido, migraciones, límites y rollback](chat-content-and-learning.md), [ADR 016](adrs/016-chat-content-learning-and-render.md).

Las nueve migraciones `20261109000000`–`20261117000000` están aplicadas únicamente en Supabase local. Pendiente operacional: desplegar, configurar/verificar discovery OAuth/MCP público, aceptar desde ChatGPT y probar renders/publicación en ensayo. La comprobación pública actual devuelve 404. COD y atribución causal por ángulo/hook requieren una fuente comprobada adicional; no se inventan datos. No hubo gasto externo ni publicación durante esta entrega.

Los apartados siguientes conservan el historial de entregas anteriores; sus conteos y pendientes corresponden a cada entrega.

---

> Retiro de redacción pagada: [inventario, límites y rollout](legacy-text-retirement.md). Los contenidos ya guardados y render/Shopify/Meta se conservan; faltan adapters MCP de conceptos estáticos, planes de galería, eventos y consejos WhatsApp.

> Actualización UGC: [guiones, render y publicación desde chat](ugc-chat-mcp.md), [ADR 014](adrs/014-chat-authored-ugc-and-durable-render.md). La migración UGC está aplicada y verificada en producción: [registro](production-ugc-migration-2026-10-06.md). Quedan las verificaciones hosted y del tema Shopify.

> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

# Product Intelligence MCP

Auditoría e implementación por fases, 2026-10-06. Baseline: `a2c272729b0299f4b073bbd3db2b54b661791aa5` (`main`). Dominio, OAuth nativo, contexto/precio, research, análisis y estrategia persistentes comprobados localmente. Generación y host remoto siguen pendientes. Estado: [implementation-status.md](implementation-status.md).

Dirección vigente: **el chat prepara análisis/estrategia y el contrato MCP define el modelo persistente**. Se depreca el pipeline anterior y su análisis histórico, sin backfill. Se conserva catálogo, Auth, Storage, calculadora Precio y packs, publicación Shopify, Meta y generación UGC/landing. V1 incluye las seis tools de conocimiento más setup y ejecución asincrónica, según [ADR 006](adrs/006-chat-first-optimization.md).

El workflow sigue siendo **Research → Strategy → Execution → Performance → Learning → Strategy**; research/strategy/refinamiento se hacen desde chat, y el SaaS valida/persiste y ejecuta las salidas conservadas.

La escritura final de landing y etiquetas ya tiene ingestión desde chat; runtime anuncia **once tools persistentes**. [Etiquetas de packs](pack-labels-mcp.md), [ADR 012](adrs/012-chat-authored-pack-labels.md). [Variantes de landing por URL](landing-variants-mcp.md), [ADR 013](adrs/013-component-landing-variants.md), implementadas localmente. Otros textos/guiones y host remoto siguen pendientes.

## Entregables

- [Estado de implementación](implementation-status.md), [código de dominio](../../lib/product-intelligence/README.md) y [cambio de auth implementado](auth-change-plan.md) y [runbook OAuth](oauth-runbook.md).
- [Approach vigente](approach-chat-first.md): flujo aceptado, deprecación, precios, generadores y frontera de coste.
- [Contratos de las diez tools](mcp-contracts.md): entradas/salidas, refs, pricing, permisos, CAS, paginación y errores, con [schemas y ejemplos verificables](contracts/README.md).
- [Contexto congelado de generación](generation-context.md): datos que usarán UGC/landing, adaptadores y guards operativos.
- [Auditoría del modelo actual](audit-current-model.md): recorrido, inventario, consumidores, riesgos y evidencia.
- [Validación de producción readonly](production-validation.md): esquema desplegado, ocho productos anonimizados, formatos, integridad y Storage, con [resultados agregados](production-validation-results.json).
- [Matriz de reutilización](reuse-matrix.md): decisiones, dependencias, costo y riesgo.
- [Modelo físico y mapping](target-model-mapping.md): entidades, campos, integridad y contratos de V1.
- [Migración y rollback](migration-and-rollback.md): ownership de escrituras, compatibilidad y gates.
- [Backlog por fases](implementation-backlog.md): paquetes estimados y aceptación.
- [ADRs](adrs/001-storage-and-ownership.md): almacenamiento, [revisiones](adrs/002-revisions-and-transactions.md), [permisos](adrs/003-identity-and-permissions.md), [MCP](adrs/004-mcp-adapter.md), [propuesta legacy sustituida](adrs/005-legacy-execution.md), [dirección aceptada desde chat](adrs/006-chat-first-optimization.md) , [contratos/etapas explícitas](adrs/007-contracts-and-generation-boundaries.md) y [OAuth/sesión aislada](adrs/008-supabase-oauth-isolation.md), [contexto persistente](adrs/009-persistent-product-context.md) y [conocimiento/estrategia](adrs/010-persistent-knowledge-and-strategy.md).
- [Spec recibido](spec-product-intelligence-mcp.md): copia sin cambios; conserva las garantías de conocimiento, pero su alcance inicial/plan de migración se ajustan por ADR 006. No constituye evidencia del sistema actual.

## Decisiones para revisión

1. `tenant` en V1 significa el comerciante identificado por `auth.users.id`. Se conserva `user_id` físico y se deriva la identidad exclusivamente del actor autenticado. No se crea un catálogo ni una organización paralela.
2. Nuevo agregado para contenido enviado desde chat y evidencia; no se genera ni migra análisis antiguo. La selección de estrategia tiene snapshot inmutable y no declara un ganador.
3. Escrituras UI/MCP compartidas, una transacción PostgreSQL por mutación mediante RPC restringida al servidor. Revisión optimista, recibo idempotente y auditoría se confirman juntos.
4. Guardar conocimiento no llama IA ni publica. Las tools de generación solicitadas por el usuario sí ejecutan UGC/landing desde contexto compacto. Una hipótesis no gana permiso de uso por estar seleccionada.
5. Precio/packs se calculan con componente y servicios actuales durante setup. La UI conserva configuración operacional, revisión de piezas y publicación; análisis/estrategia se escriben por MCP.
6. Los generadores y consumidores Meta nuevos leen un snapshot canónico directo, sin fichas/avatares/rankings ficticios ni proyecciones a tablas retiradas. Se conservan piezas/campañas/IDs operativos existentes.

## Estado de cierre

La auditoría estática, el diseño y el diagnóstico de producción en **solo lectura** están entregados. El 2026-10-06 se consultaron las ocho filas de products del proyecto vinculado: 52 tablas públicas y 36 versiones de migración; las 62 relaciones públicas y las 249 referencias a Storage comprobadas no muestran inconsistencias presentes. El dataset tiene un solo dueño: no demuestra aislamiento entre dos tenants, transacciones ni escala.

Producción conserva principalmente análisis legacy: siete avatares v4, fichas con campos históricos faltantes y cuatro desarrollos con landing anterior. Las dos corridas del mega prompt están failed/timeout en report, sin extracción ni confirmación. Ese análisis se depreca según la decisión posterior; no se convierte en contexto ni se reintenta para poblar el MCP.

Los diez contratos tienen tipos Zod compartidos y schemas derivados; Ajv 8 comprueba draft 2020-12 completo con 17 entradas, 16 salidas, 20 rechazos, límites y pricing. El núcleo implementa validaciones de grafo/permisos, preparación de merge/patch, cierre de estrategia y congelación de contexto. OAuth/HTTP y transacciones de contexto/precio se comprobaron en Supabase/Next locales; host/jobs conservan sus gates de [aceptación](contracts/domain-cases.md).

El runtime local anuncia siete tools: contexto, research, análisis/patch y selección/consulta de estrategia, con CAS/receipts/audit/historia y autorización real. Quedan jobs y adaptación/regresión de generadores/Meta, revisión UI/deprecación y OAuth/host hosted. [ADR 010](adrs/010-persistent-knowledge-and-strategy.md). No se confirma conexión de un chat remoto. La base local conserva sus datos, sin reset ni escrituras productivas. [ADR 009](adrs/009-persistent-product-context.md).

Se preservaron los archivos preexistentes sin seguimiento `AGENTS.md` y `docs/auditoria-arquitectura-creativa.md`. La verificación actual y los límites de cada entrega se registran en [estado de implementación](implementation-status.md).

- [Contenido final de tienda desde chat](landing-content-mcp.md): 17 contratos existentes, tools de lectura/ingestión, CAS y gaps de medios. [ADR 011](adrs/011-chat-authored-store-content.md) supersede writers finales pagados.
