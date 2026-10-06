# ADR 006 — Optimización desde el chat y contrato MCP canónico

Estado: dirección aceptada por el usuario; implementación pendiente. Fecha: 2026-10-06. Sustituye el plan de migrar análisis legacy, mantener mega prompt y escribir proyecciones en fichas/avatares/rankings del ADR 005. Ajusta ownership del ADR 001 y alcance de V1; conserva las garantías del ADR 002–004.

## Decisiones recibidas

- El análisis y la optimización se hacen en el chat y se envían al MCP. El contrato MCP define el modelo de conocimiento persistente; no lo definen las tablas ni las pantallas del pipeline anterior.
- Conservar catálogo, Auth, Storage, publicación Shopify y todos los módulos operativos de Meta.
- Conservar Precio y packs: el comerciante ingresa el costo del proveedor durante la configuración inicial y se reutiliza la calculadora validada. Precios, packs, CPA y ganancias los calcula el código compartido y se recalculan en servidor.
- MCP puede iniciar generación UGC y contenido de landing. La UI muestra el contexto y los resultados, permite revisar y publicar; no vuelve a generar el análisis.
- Deprecar el análisis histórico: no convertirlo en personas, facts o estrategias del nuevo modelo.

## Decisión técnica

El MCP es un adaptador de comandos tipados sobre el dominio persistente. «Define el modelo» significa diseñar schemas y relaciones desde el contexto que envía el chat, con IDs, evidencia, revisiones y selección explícita. No permite que un agente cambie tablas, schemas o reglas de negocio mediante texto libre.

Eliminar del flujo nuevo identificación IA, ficha/cliente ideal generados, mega informe/extracción, orquestadores/agentes de ángulos y ganchos, crítica y propuestas autónomas de investigación. No usar llamadas internas de IA para convertir o completar el payload recibido. El chat corrige los campos faltantes tras errores tipados y diffs.

Adaptar UGC, landing, imágenes necesarias para esas salidas y consumidores Meta a un `GenerationContext` congelado del agregado nuevo. Sus funciones no deben cargar `latestBrief/latestAvatars/approvedAngles` para nuevos jobs, ni crear filas falsas approved en las tablas antiguas. Reusar validadores, prompts de generación final, proveedores, render, componentes, Storage y costes donde correspondan.

Retener Meta incluye conexiones, píxel, cuentas, medios, uploads, plantillas, campañas, conjuntos, anuncios, launch, presupuestos, reglas automáticas, insights y decisiones existentes. Cambiar solo su entrada de contexto marketing/provenance cuando dependa del análisis anterior. Los assets/creativos usados en Meta siguen disponibles; no borrar campañas ni resetear configuración por deprecar análisis. La redacción autónoma de conceptos/estrategias previa a esos assets queda reemplazada por briefs enviados desde chat, manteniendo la producción/render y las piezas existentes.

Mantener el análisis viejo fuera del contexto MCP nuevo. Dejar sus tablas sin nuevos writers tras el corte; el cleanup físico se difiere hasta comprobar referencias de jobs, campañas y piezas conservadas. Deprecación no exige una eliminación inmediata ni otorga permiso para una escritura productiva durante esta revisión. Los documentos y métricas de auditoría permanecen como evidencia histórica.

## Frontera de coste y alcance

La suposición de trabajo es que el chat envía research, análisis, estrategia y brief; los generadores conservados redactan UGC/landing y producen sus assets. Se pidió precisar si el chat enviará además guiones/textos finales: esa modalidad eliminaría llamadas de redacción adicionales, pero no se presume implementada. Se puede incorporar después al mismo dominio sin cambiar identidad, pricing, evidencia o revisión.

El ahorro buscado consiste en retirar las llamadas de análisis duplicadas. UGC actual todavía tiene redacción de guion, plan de tomas, QA y proveedores visuales; landing tiene argumento/redacción y posibles imágenes. Conservarlos no hace gratuita la producción. Medir llamadas, tokens y coste real por request; no prometer un porcentaje de ahorro sin comparar workloads equivalentes.

V1 requiere las seis tools de inteligencia más configuración de contexto y generación asincrónica: `save_product_context`, `generate_landing`, `generate_ugc`, `get_generation_status`. Una tool que arranca un trabajo devuelve operation_id y status; no mantiene un request abierto durante minutos ni genera/publica automáticamente al guardar análisis. Publicación sigue en la UI y los conectores existentes.

## Consecuencias

Ya no se necesita backfill semántico, pi_legacy_links ni un estado shadow que convierta la misma información. Sí se necesita un corte controlado de lectores/writers, migraciones aditivas, fixtures del contexto nuevo, adaptación directa de los dos generadores y regresión completa de Meta. Lo preservado de catálogo/pricing/assets/configuración sí se referencia/snapshottea porque es dato operativo vigente, no análisis legado inferido.

La restricción de dos o tres ángulos del pipeline anterior deja de bloquear UGC o landing: un ángulo canónico válido basta para un UGC. Reglas de agrupación y campañas Meta se conservan por canal/plantilla, sin fabricar ángulos para llenar slots. Cada pieza nueva lleva strategy_version_id, analysis_revision y angle_id estable cuando aplique.

No se implementa ni modifica producción en este cambio de propuesta. El [approach](../approach-chat-first.md), [modelo](../target-model-mapping.md), [plan](../migration-and-rollback.md) y [backlog](../implementation-backlog.md) describen el alcance vigente.
