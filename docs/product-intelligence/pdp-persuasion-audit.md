# Angle-driven PDP: auditoría y arquitectura adoptada

Fecha: 2026-10-07. Fuente de producto: `dropflex_angle_driven_pdp_spec.md`, contrastada con el repositorio antes de editar. El spec describe intenciones; los contratos operativos existentes determinan cómo implementarlas. Esta iteración no se desplegó en producción ni publicó productos en Shopify.

## 1. Arquitectura real relevante

Next App Router sirve la UI y el transporte MCP. `lib/product-intelligence/http-runtime.ts` conecta OAuth, autorización vigente y el ejecutor común de dominio. `knowledge-service.ts` deriva a servicios pequeños; `repository.ts` accede a RPC transaccionales. Los agentes redactan en el chat: el backend recibe, valida y persiste. Los renders de imágenes/UGC son operaciones distintas, con proveedores del comerciante.

El dominio canónico ya contiene personas, JTBD, pains, desires, objections, angles, customer language, offers, sources, facts y evidence links en tablas `pi_*`. `schemas.ts`, `graph.ts`, `knowledge.ts` y las migraciones de Product Intelligence son la fuente de sus relaciones y restricciones. Los modelos de optimización antiguos no constituyen una segunda fuente que esta feature deba rehabilitar.

`pi_strategy_versions` congela la selección y sus dependencias. `pi_strategy_events` representa draft/selected/superseded/archived. La ejecución obtiene ese snapshot y comprueba su vigencia; no lo reconstruye pegando las últimas filas sobre una estrategia anterior.

La página ya usa `copy_runs` y `page_components`: propuesta, contenido decidido, estado, habilitación y `superseded_at`. Un componente admite contenido legacy o hasta doce variantes `{key, angle_id, hook_id, content, images?}`, con default obligatorio. Los selectores públicos no son los UUID analíticos. No existía una entidad que ordenara y seleccionara el conjunto de componentes por narrativa.

Shopify se publica mediante `lib/pipeline/publish.ts`, `publish/mapping.ts` y el kit en `lib/shopify/components/`. Hay dieciséis componentes y la ficha comercial `listing`. Las fuentes Liquid se sincronizan al tema con `npm run shopify:components`; no se mantiene una implementación alternativa en el tema.

Las escrituras canónicas usan autorización, lock por producto, revisión del contexto, etag del artefacto, huella del snapshot e idempotencia. Los recibos se consultan antes de CAS y se confirman con artefacto, historial y auditoría. `dry_run` no debe crear propuestas, historial ni recibos.

Performance consume `ad_insights_daily` ya cacheado, agregado por campañas del producto. `pi_product_learnings` conserva hipótesis, observación, límites y medición congelada. No existe atribución PDP/section suficientemente comprobada para declarar causalidad o ganadores.

## 2. Qué reutilizar, extender y crear

| Pieza del spec | Decisión en este repositorio |
| --- | --- |
| ProductAnalysis | Reutilizar el grafo `pi_*`; no crear otra tabla ni copiar personas/ángulos. |
| ProductStrategy | Reutilizar snapshots y estados actuales, sin modificar su significado. |
| LandingContent | Extender `save_landing_content` con schema 1.2 y metadata opcional; conservar 1.0/1.1. |
| Component registry | Añadir capacidades persuasivas sobre los IDs, contratos, mínimos y slots del catálogo existente. |
| AnglePersuasionPlan | Nueva entidad: tesis, creencias, presupuesto, arquitectura e intención de claims. |
| LandingExperience | Nueva entidad: revisión exacta del plan, selección concreta, orden, variantes y overrides. |
| Claims/evidence | Referenciar facts/evidence existentes; no crear un segundo research ni convertir claims antiguos en verificados. |
| Gallery/creative/UGC | Reutilizar artefactos y sus renders; vincular IDs desde plan/experiencia, sin nuevas tablas de assets. |
| Pack labels | Reutilizar precio/packs y sus etiquetas aprobadas; no recalcular oferta ni duplicar su aprobación. |
| Learning | Extender con referencias a revisiones históricas, manteniendo `product_campaigns_only`. |

**No cambiar:** auth/proxy, selección de estrategia, pricing, optimización/Storage, contratos nativos de componentes, flujo de aprobación de contenido, sincronización/eliminación de productos y forma de cobrar proveedores. Tampoco crear `generate_pdp`, un writer de IA server-side, otra biblioteca de plantillas o una infraestructura analítica nueva.

## 3. Discrepancias y simplificaciones del spec

- `ProductAnalysis` es un concepto ya cubierto por el dominio; su nombre no justifica persistencia paralela.
- Los enlaces actuales usan `df_angle`/`df_hook`. Se incorporan `angle`/`hook` como alias, conservando enlaces existentes y rechazando duplicados/conflictos.
- Los componentes reales mezclan bloques dentro de la ficha y secciones independientes. La ficha nativa con formulario, precio, packs y galería permanece. El nuevo runtime mueve únicamente nodos DropFlex de contenido; los apoyos comerciales quedan junto al hero.
- Los jobs son diecinueve valores canónicos. `trust`, `proof` y `similarity` son tipos de creencia; no se inventan jobs equivalentes adicionales.
- `benefit-double-box` y `scrolling-benefits` contienen argumentos comerciales, no cualquier reframe arbitrario. El registry refleja sus contratos reales.
- UGC actual es generado. Puede demostrar/explicar o activar deseo, pero no resolver prueba social de compradores reales. `insta-story` tampoco adquiere calidad de evidencia por su formato.
- Foto y razones exige cuatro o seis tarjetas; Comparativa exige cuatro a seis filas. Se conserva esa cardinalidad y el límite de copy total. El máximo de viñetas afecta listas, momentos y FAQ; no se rompe un componente para imponer tres filas a su tabla.
- Dos aggregates JSONB con heads e historial bastan. No se crean tablas independientes para cada creencia, sección, claim, binding ni variante.
- Un switch de entorno y otro por producto bastan para V1. No se implementa el sistema completo de flags sugerido en el spec.
- No se hace una arquitectura por hook. Una experiencia con hook comparte el plan; una arquitectura distinta requiere una experiencia explícita.
- La utilidad de componentes es editorial: jobs, medios, evidencia, disponibilidad y coste de atención orientan al agente. No se simula una fórmula de conversión científica.

## 4. Deuda técnica observada

El registry previo tenía semántica comercial en documentación y prompts, pero no un contrato de selección persuasiva. La topología fija del tema no expresaba un recorrido por ángulo. Los assets y los componentes se aprueban por sus flujos actuales: añadir un aggregate exige proteger también esas dependencias, no solo su propia fila.

El lint global incluye JavaScript del tema con 139 errores y tres warnings preexistentes; los archivos TS/TSX de esta feature pasan lint separado. Theme Check reporta warnings existentes, sin errores. Los contratos heredados de landing devuelven versión de contrato 1.1; la lectura 1.2 agrega procedencia solo al solicitar esa versión explícitamente, preservando lectores estrictos viejos. La trazabilidad canónica no elimina la necesidad de revisión humana del significado del copy.

## 5. Riesgos y controles

| Riesgo | Control |
| --- | --- |
| Una pantalla vieja activa contenido distinto del que mostró | Revisión, etag y `expected_planning_stamp` del contexto leído; revalidación SQL bajo lock. |
| Reintento duplica entidades | Receipt antes de CAS; misma clave/carga devuelve la misma respuesta; otra carga rechaza. |
| Cross-tenant o grant revocado | Autorización y pertenencia en servicio y RPC, también antes de replay; ACL cerrado. |
| Regenerar reconstruye estrategia | Plan separado del contenido; referencias estables y revisión exacta del plan. |
| Regenerar borra edición manual | Overrides preservados en experiencia; writer de landing bloquea cambios delegados a copy/assets protegidos. |
| Plan modificado altera experiencias activas | Plan consumido queda inmutable mientras tenga experiencia activa. Crear otro o archivar primero. |
| PDP larga o redundante | Cuatro a siete creencias, hasta siete bloques principales y dos apoyos; cobertura, contribución propia, copy real y secuencias densas validadas. |
| Claim sintético se presenta como prueba | Facts utilizables, evidencia supporting vinculada, reseñas aprobadas reales, UGC separado de prueba. Alcance sensible requiere revisión humana explícita. |
| Tema incompleto o query malicioso | Prevalidar nodos/variantes antes de mover; restaurar legacy ante ausencia/error; no crear HTML desde query o manifest. |
| Archivar/eliminar deja archivos huérfanos | Ningún bucket nuevo; FKs `on delete cascade` y activos existentes conservan su eliminación operacional. |
| Se atribuye rendimiento a arquitectura sin datos | Learning exige declarar atribución actual por campaña; evento runtime aporta dimensiones, no causalidad. |

La validación garantiza integridad estructural y referencial de claims declarados. No demuestra que una evidencia sustente cada matiz del lenguaje natural ni detecta todas las afirmaciones implícitas del copy. No hay boolean `verified` que un agente pueda enviar para aprobarse. La aprobación humana y la revalidación de publicación siguen siendo necesarias.

## 6. Modelo de datos adoptado

`products.pdp_persuasion_enabled` empieza en false.

`pi_persuasion_plans`: propietario/producto, estrategia, ángulo analítico, selector público, payload schema 1.0, revisión y etag. Guarda audiencia, tesis, minimum belief path ordenado, presupuesto, secciones con un job principal, dirección creativa, referencias y claims. `necessity` responde qué quedaría sin resolver al quitar la sección. Un bloque redundante exige justificación explícita.

`pi_landing_experiences`: propietario/producto, plan y revisión fijada, estrategia/ángulo, selectores angle/hook, key, architecture variant, estado y default. Cada sección conserva key, componente, variante de contenido, creencias/job, habilitación, bindings y campos con override manual. Solo un default activo y una experiencia activa por ruta pública.

`pi_pdp_revisions`: snapshots inmutables de cada revisión de ambos aggregates, con issues y actor. No es otra entidad de producto: es historial transaccional. Todas las nuevas relaciones desaparecen al eliminar el producto. V1 limita a veinte planes y veinte experiencias por producto para mantener lecturas acotadas; no pretende ser un catálogo de miles de tests.

`page_components.pdp_metadata`: procedencia opcional de schema 1.2; no cambia el contenido nativo. Las imágenes concretas permanecen en el binding de la variante existente. Si el binding de experiencia declara imágenes, debe coincidir; nunca se acepta un binding que el publicador ignoraría.

Learning schema 1.1 admite referencias opcionales a plan/experiencia y sus revisiones exactas. Se valida contra historial, no contra el head mutable.

## 7. Tools y contratos

Nuevos: `get_pdp_planning_context`, `get_component_catalog`, `get_angle_persuasion_plan`, `validate_angle_persuasion_plan`, `save_angle_persuasion_plan`, `get_landing_experience`, `save_landing_experience`.

Los get de plan/experiencia devuelven `planning_stamp` y etag. Save exige `expected_revision`, `expected_etag`, `expected_planning_stamp`, `idempotency_key` y soporta `dry_run`. Validar no escribe. El contexto devuelve estrategia congelada y restricciones actuales, oferta, assets, landing y catálogo; los contratos de copy se consultan con el `get_landing_content` existente.

Planning context y los listados devuelven resúmenes de heads y bindings, no todas las versiones de copy ni el payload completo de todos los planes. Obtener una entidad concreta devuelve su contenido; el copy/reseñas se consultan por sus tools actuales. Así se respeta el límite MCP de respuesta sin convertir contexto en un tool monolítico.

`save_landing_content` añade schema 1.2; `save_product_learning`, 1.1. Ningún contrato viejo exige la metadata nueva. Solo el merchant aprueba planes y activa experiencias; el chat puede proponer drafts. El servidor HTTP de producción no anuncia los siete tools nuevos si el switch de entorno está apagado.

## 8. Migraciones

1. `20261120000000_pdp_persuasion.sql`: flag, heads, historial, constraints, ACL/RLS, carga consistente y commit transaccional.
2. `20261121000000_pdp_content_bindings.sql`: metadata y envoltura del writer existente; referencias, protección de overrides, receipt con etag definitivo, misma transacción.
3. `20261122000000_pdp_learning_refs.sql`: envoltura del writer existente para referencias históricas y atribución explícita.

No se modifican migraciones anteriores ni se transforma contenido existente. Las funciones legacy internas conservan sus contratos y dejan de ser invocables directamente por `service_role`.

## 9. Runtime y publicación

La activación en DropFlex no publica. `preparePublish` recupera experiencias activas y revalida estrategia, revisión del plan, copy aprobado, medios y variante que efectivamente se publicará. Una experiencia inválida bloquea esa publicación explícita para no cambiar silenciosamente la intención aprobada.

Se publica `dropflex.landing_experiences` junto a los metafields de contenido/medios relevantes en el grupo atómico existente. Sin flag/experiencias, el publicador vuelve a legacy y elimina el metafield al publicar. Las verificaciones del kit exigen el nuevo snippet cuando se publican experiencias.

El manifest contiene IDs, revisiones, arquitectura y bindings; nunca copy sin escapar ni instrucciones. No hay consulta nueva a Next/Supabase desde cada visitante. Resolver: exact angle+hook → angle sin hook → default producto → legacy. Query inválido no rompe la página. Sin JavaScript se presenta la PDP legacy.

El switch del backend no puede borrar por sí solo un metafield ya publicado: para rollback de la tienda hay que republicar sin experiencias o eliminar ese metafield explícitamente.

## 10. Shopify y merchant UI

Wrappers `data-df-pdp-component` identifican exclusivamente piezas propias. El runtime conserva posiciones originales y prevalida componentes y templates; restaura antes de cada navegación. Mantiene formulario, packs, galería y controles de compra. Los snippets y sus fuentes siguen el kit único existente.

La Página del producto incorpora el workbench solo para productos habilitados: muestra creencias/issues, aprueba el plan, crea experiencias/variantes, reordena, deshabilita, selecciona componente compatible y copy, activa/archiva y previsualiza en móvil con los previews existentes. La edición de textos/assets usa los editores actuales. No se duplican controles de imágenes ni renders.

Una regeneración de copy opera sobre contenido; una dirección nueva modifica el brief; replantear una sección exige revisar el plan; reconstruir la narrativa crea otro plan si el actual ya está consumido. La UI de esta iteración deja la autoría estratégica en el chat.

## 11. Testing strategy

- Unitarios: budgets, cobertura, redundancia, pertenencia, restricciones de evidencia, testimonios/UGC, copy visible y resolver.
- Supabase local opt-in: contexto canónico real, dry run, CAS concurrente, replay/payload diferente, metadata, aprobación nativa, activación, inmutabilidad, ACL, cascada y learning histórico.
- OAuth local real: scopes/grant vigente, prohibición de activación delegada, conservación de overrides y revocación antes de replay.
- Chromium opt-in ejecuta los scripts reales del kit: orden, binding de copy, alias/gancho, popstate, nodos ausentes, manifiesto corrupto, parámetros inválidos y ausencia de JS, conservando formulario.
- Regresión: suite completa, typecheck, contratos generados, lint de cambios, tokens, sincronización de fuentes/preview y Theme Check.

Estas pruebas no equivalen a una publicación en una tienda real ni a medir conversión. Ver [runbook](pdp-persuasion-runbook.md) para comandos y rollout.

## 12. Rollout

Aplicar migraciones, desplegar app/MCP y actualizar kit de tema; luego habilitar entorno y un producto piloto. Crear/validar/aprobar plan en chat/merchant, vincular contenido decidido y activar experiencia. Publicar explícitamente y comprobar rutas, fallback, formulario y versión del kit en una tienda de prueba antes de ampliar.

Empezar con un angle default y sin experiencias por hook; añadir hero/asset alternativo solo por necesidad real. No migrar automáticamente PDP actuales. Si falta evidencia o medios, conservar drafts y legacy. Performance inicial continúa por campaña; incorporar ATC/checkout con las dimensiones emitidas solo cuando exista un colector fiable y su consentimiento/caché estén auditados.

## 13. Secuencia concreta de commits

| Commit/phase | Alcance y criterio de cierre |
| --- | --- |
| 1 — Dominio y capacidades | Schemas de plan/experiencia, registry sobre catálogo real, budgets/claims y tests puros. |
| 2 — Persistencia transaccional | Migración heads/historial/flags, repositorio/RPC, lock/CAS/replay/dry run y cascada probados. |
| 3 — MCP y procedencia | Siete tools, discovery gated, landing 1.2 y learning 1.1, contratos exportados y OAuth real. |
| 4 — Resolver y Shopify | Manifest, publicación atómica existente, runtime con legacy fallback y pruebas Chromium. |
| 5 — Merchant UI y documentación | Workbench, overrides, preview móvil, tokens, auditoría/ADR/runbook. |
| 6 — Piloto operativo | Migraciones/kit/app remotos, producto habilitado, publicación y validación en tienda; requiere entorno piloto elegido. |
| 7 — Medición y aprendizaje | Conectar tracking existente cuando sea fiable; observar arquitectura con límites explícitos, sin elección automática de winner. |

Los cinco primeros bloques están implementados en el árbol de trabajo; no se crearon commits ni se incluyeron los cambios previos del usuario en un commit automático. El piloto y la analítica de atribución real quedan fuera de la validación local.
