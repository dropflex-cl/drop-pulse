# Estado vigente: contenido y aprendizaje implementados

Completadas las tools de conceptos/dirección de arte/conversaciones, planes de galería, eventos, consejos WhatsApp, render de galería y performance/aprendizaje persistentes. Información base y navegación leen el contexto/selección canónicos; los estáticos conservan selectores de landing en Meta. **29 tools anunciadas, 30 contratos derivados**. [Recorrido, migraciones, límites y rollback](chat-content-and-learning.md), [ADR 016](adrs/016-chat-content-learning-and-render.md).

Las nueve migraciones `20261109000000`–`20261117000000` quedaron aplicadas y verificadas en producción después del push de `8531956`: [registro](production-content-migrations-2026-10-06.md). Pendiente operacional: verificar despliegue app, configurar/verificar discovery OAuth/MCP público, aceptar desde ChatGPT y probar renders/publicación en ensayo. La comprobación pública actual devuelve 404. COD y atribución causal por ángulo/hook requieren una fuente comprobada adicional; no se inventan datos. No hubo gasto externo ni publicación durante esta entrega.

Los apartados siguientes conservan el historial de entregas anteriores; sus conteos y pendientes corresponden a cada entrega.

---

# Prioridad actual: completar cobertura de ingestión MCP

Retirados físicamente los writers pagados de texto y las acciones UI, con APIs antiguas autenticadas 410. Sin migraciones ni eliminación de contenido. [Inventario y límites](legacy-text-retirement.md), [ADR 015](adrs/015-retire-paid-text-writers.md).

Pendiente: get/save para conceptos estáticos/dirección de arte y conversaciones creativas, planes de galería, textos de eventos y consejos de WhatsApp. Reutilizar tablas/render/revisión existentes; agregar snapshots/CAS/receipts/audit y pruebas de aislamiento. Luego adaptar los datos base y el navegador de etapas al estado PI canónico sin proyectar análisis legacy y completar el piloto ChatGPT/Shopify/Meta. No reintroducir redacción pagada para cubrir estos huecos.

Los siguientes apartados son registros de entregas anteriores.

---

> UGC desde chat implementado: ingestión, revisión, cola durable, renders, conciliación, montaje y vínculos Shopify/Meta. [Estado y pasos de despliegue](ugc-chat-mcp.md). Los paquetes históricos siguientes no reflejan por sí solos el avance actual.

> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

# Landing por ángulo y hook completada localmente

Implementación y pruebas locales de arrays por componente, edición/revisión, medios por variante y selección URL en el template Shopify. [Contrato, despliegue y rollback](landing-variants-mcp.md), [ADR 013](adrs/013-component-landing-variants.md). Se mantienen once tools persistentes; get/save_landing_content usan contrato 1.1 con compatibilidad 1.0. Migración 20261107000000 aplicada solo en local. Producción sigue readonly.

El siguiente paso operacional es aplicar migraciones, desplegar app/MCP y actualizar/probar el tema en una tienda de prueba. El siguiente paquete de producto sigue siendo guiones y planificación UGC desde chat. Videos del carrusel, atribución por selector y host ChatGPT remoto siguen pendientes.

---

# Prioridad actual: guiones y conceptos desde chat

Landing y etiquetas de packs completadas localmente. Once tools anunciadas; [etiquetas y límites](pack-labels-mcp.md). Siguiente paquete: consulta/ingestión de guiones y planificación UGC, después conceptos/dirección de arte y prompts de anuncios. Imágenes permanecen con proveedores del SaaS; render de clips pendiente de aclaración de alcance. Continúan planes de imágenes, eventos, WhatsApp, retiro completo legacy y piloto ChatGPT remoto.

---

# Prioridad actual: todo el texto desde chat

La decisión actual y [ADR 011](adrs/011-chat-authored-store-content.md) sustituyen la estimación/suposición de writers finales pagados de abajo. Landing completada localmente con dos tools de ingestión/lectura; quedan adapters de guiones/planes/conceptos/packs/eventos/WhatsApp, ver [inventario y límites comprobados](landing-content-mcp.md). Imágenes permanecen con providers del SaaS. Render de clips pendiente de aclaración. Los jobs de escritura de texto ya no son el siguiente paquete.

---

# Backlog vigente: optimización desde chat

Dirección: [approach](approach-chat-first.md), [ADR 006](adrs/006-chat-first-optimization.md) y [plan de transición](migration-and-rollback.md). Sustituye las tareas de backfill/proyección del análisis anterior. El spec adjunto sigue aportando las garantías de las seis tools de conocimiento; el alcance se amplía con setup y generación UGC/landing solicitados por el usuario.

## Trabajo ya realizado

Auditoría estática y validación readonly de producción entregadas. La primera base de [dominio y adaptador SDK local](implementation-status.md) está implementada: tipos Zod, schemas derivados/Ajv 2020-12, grafo/permisos/revisión/replay, preparación de merge/patch, calculadora, cierre de estrategia y contexto congelado. Se descubre el catálogo de diez tools con Client/InMemoryTransport oficiales. OAuth/HTTP y grants se implementaron y probaron en Supabase/Next locales ([ADR 008](adrs/008-supabase-oauth-isolation.md)); las siete tools de conocimiento/setup operan con persistencia local ([ADR 010](adrs/010-persistent-knowledge-and-strategy.md)). Faltan cliente remoto real, workers y [casos de integración](contracts/domain-cases.md). No se modificó producción ni se desactivó el flujo vigente. Los formatos antiguos solo sirven para regresión de piezas/Meta, sin poblar el modelo nuevo.

## Primera entrega

Estimaciones de días de ingeniería, no calendario. Suposición: chat aporta contexto/brief y writers UGC/landing conservados redactan finales. Si se elige ingestión de guiones/textos terminados desde chat, ajustar contratos/adaptadores y estimación antes de implementar esa variante.

| Paquete | Trabajo | Aceptación | Dependencias | Esfuerzo |
|---|---|---|---|---|
| 1. Contratos y fixtures | Base local entregada: schemas desde dominio, preparación de mutaciones y snapshots, pruebas de invariantes/2020-12. Integración transaccional en paquete 3 | Grafo enviado desde chat, errores accionables, fuentes/hipótesis/selección separadas; ninguna llamada IA al guardar | ADR 006/007; dominio puede avanzar sin host | 3–5 días, estimación original del paquete |
| 2. Auth y spike MCP | SDK/HTTP/OAuth y siete tools persistentes comprobados localmente. Auth autorizado. Faltan hosted/host remoto y generación/status | Discovery, aislamiento de respuesta, read/write/verify/generate autorizados, revocación; cookies solo UI | Contrato; host/configuración hosted pendientes; sin permiso de escritura productiva | 3–6 días |
| 3. Persistencia y jobs | Contexto/grafo/research/patch/estrategia y cursores ya tienen persistencia local, FKs/RLS/RPC, CAS/receipts/audit/historia y cascadas. Pendientes outbox/generation_requests y provenance | Batch atómico, replay concurrente, snapshot exacto, delivery reintentable y cascadas | Contrato; PostgreSQL aislado | 5–8 días, estimación original |
| 4. Contexto y calculadora | Implementado localmente: setup/precio UI y MCP con writer único, proveedor/defaults, base, precisión, revisión, protección de pantalla vieja y etiquetas aprobadas vigentes. Pendiente propuesta de etiquetas desde chat | Costo proveedor requerido para cálculo; supuestos faltantes explícitos; pack recomendado correcto; precios no cambian Shopify al guardar | 1/3; servicios pricing actuales | 2–3 días, estimación original |
| 5. Landing y UGC directos | Reemplazar loaders legacy; writers/render/QA con contexto compacto; requests por etapa, status, outputs revisables | No fichas/avatares/rankings falsos; un ángulo válido para UGC; sin relecturas latest; reescritura parcial conserva aprobado | 1/3/4 | 6–10 días |
| 6. UI y Meta preservados | UI de contexto/revisión/publicación; retirar acciones/stages de análisis; adaptar adsContext/medios/stamps; mantener render creativo y operación Meta | Catálogo/Storage/Shopify intactos; campañas/budgets/engine/sync existentes funcionan; ninguna reconstrucción legacy como contexto | 3/5; design-system | 4–7 días |
| 7. Deprecación y piloto | Desactivar writers/endpoints antiguos, aislar jobs en vuelo, pruebas de coste/host/rollback y runbook | Nuevo chat recupera estado; guardar no cobra; replay no duplica job; no llamada product_data/strategy/ángulos/hooks en flujo nuevo | Todos; gates del plan | 2–4 días |

Total orientativo: **25–43 días de ingeniería**, más preparación/acceso a entorno aislado y esperas de proveedor/host. Retirar backfill elimina trabajo, pero incorporar generación y preservar Meta exige adaptadores/regresión. No equivale a promesa de entrega ni a ahorro porcentual de tokens.

## Pruebas que definen aceptación

| Caso | Resultado exigido |
|---|---|
| Contexto nuevo de producto antiguo | Conserva catálogo/pricing/assets, análisis/selección vacíos; no importa product_data/avatar/ranking viejo. |
| Precio proveedor y supuestos | Mismos resultados de la calculadora actual en UI y servidor; no salvar derivados del chat; defaults válidos y faltantes explícitos. |
| Cambia pricing | Packs recalculados, etiquetas/oferta dependiente stale, nueva revisión; Shopify/campañas no se modifican implícitamente. |
| Guardar análisis/research/estrategia | Cero llamadas a modelos o proveedores; IDs servidor y refs coherentes; unknown fields rechazados. |
| Merge/patch/dry_run/no-op | Omisión conserva, [] no borra, null solo nullable, batch todo o nada; dry_run no consume key; no-op no crea revisión. |
| Dos chats revision N | Un commit; otro conflicto explícito, sin perder ediciones. |
| Replay / misma key diferente contenido | Mismo receipt/job sin nueva corrida; cambio de payload rechaza. |
| Otro tenant/producto | Rechazo en tool, relaciones, fuente, asset, estrategia, job/cursor y RPC sin filtrar datos. |
| Verify/claims | Write no aprueba ni cambia contenido aprobado conservando verificación; revocar conserva historia y bloquea uso dependiente. |
| Lectura paginada/histórica | Revisión consistente, auxiliary snapshots con fecha, cursor autorizado; no atribución retrospectiva de performance. |
| Generación mínima | UGC usa un angle_id y snapshot válido sin exigir dos briefs legacy; landing no exige avatar aprobado anterior. |
| Job y edición simultáneos | Worker utiliza input congelado, output asociado a esa revisión y no sustituye material/selección más recientes. |
| Etapas pagadas | Guardar no arranca ninguna; script/keyframes/clips/images explícitos y con revisiones previas requeridas. Consulta de status no hace polling externo. |
| Respuesta ambigua de proveedor | Se concilia provider_request_id; sin retry ciego que pueda repetir gasto. La garantía externa se documenta por proveedor. |
| Meta regression | Media/upload, templates, campaign/adset/ad, launch, budgets, engine, insights y reglas existentes pasan; IDs preservados. |
| Piezas conservadas | PDP/UGC/assets ya existentes siguen visibles/revisables/publicables; provenance antigua unknown, no inventada. |
| Retirada | Ningún camino nuevo carga latestBrief/latestAvatars/approvedAngles ni dispara informe/extracción/agentes; APIs retiradas no producen nuevas corridas. |
| Borrado Shopify | Storage primero, pausa Meta, cascadas PI/jobs/audit/receipts; fallo de Storage y carrera con escritor permiten reintento seguro. |
| Cliente real | Nuevo chat reconstruye contexto; scopes, expiry/revocación, output/error MCP y diez tools verificadas con el host objetivo. |

Fixture principal: cuatro personas/varios ángulos enviados desde chat, facts no verificados, fuentes reales referenciadas, lenguaje synthetic, precio calculado y selección explícita. Generación con proveedores mock en pruebas aisladas, sin gastar créditos productivos. Fixtures adicionales de campañas y piezas antiguas sin provenance canónica y de jobs legacy en vuelo. No reconstruir contenidos sensibles productivos para estas pruebas.

## Trabajo posterior

- Ingestión de guiones/textos terminados desde chat si se elige esa frontera: validación/encaje/render sin reescribirlos; no silently fallback a redacción pagada.
- PDPVersion completo, operaciones de publicación con readback y retención de assets publicados; reusar publicador actual.
- Experimentos/learning con regla, ventana y source, y COD desde una fuente comprobada; compras Meta no equivalen a cobrado/entregado.
- Cleanup físico de tablas/campos de análisis retirado solo después de verificar que no rompe piezas/jobs/Meta conservados. No es requisito para habilitar el modelo MCP.

No reintroducir generación de análisis como fallback para resolver missing_fields o acelerar migración. El chat corrige el contexto; el SaaS valida, persiste y ejecuta las salidas conservadas.
