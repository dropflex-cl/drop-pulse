# ADR 010 — Conocimiento relacional y decisiones persistentes

Estado: implementado y comprobado en Supabase local. Fecha: 2026-10-06. Complementa [ADR 009](009-persistent-product-context.md), [ADR 001](001-storage-and-ownership.md) y [ADR 002](002-revisions-and-transactions.md). Producción no se modificó.

## Decisión

La migración `20261104000000_product_intelligence_knowledge.sql` agrega fuentes, hechos, personas, JTBD, dolores, deseos, objeciones, ángulos, lenguaje y ofertas como tablas separadas con columnas de dominio. Los arrays de relaciones y la evidencia de análisis se almacenan en puentes, reconstruidos para el contrato MCP. Purchase criteria, magnitudes, guidance y snapshots financieros siguen como hojas JSON tipadas; los IDs dentro de guidance y las fuentes de magnitudes tienen también FKs físicas. No existe un gran JSON editable como fuente de verdad.

Cada FK nueva liga producto/dueño; las relaciones de JTBD/dolores/deseos y objeciones de un ángulo también ligan persona. Los enlaces de hechos son únicos por hecho/fuente/relación/fragmento. Los IDs los asigna el servidor; los comandos archivan identidades y nunca borran por omisión o array vacío. Todas las tablas tienen RLS de lectura del dueño. `service_role` lee las entidades, pero solo los RPC pueden escribirlas; los helpers no son públicos.

`pi_load_knowledge` y `pi_commit_knowledge` reautorizan token/grant/sesión/scopes vivos, verifican dueño y borrado, bloquean el producto, buscan receipt antes de CAS y confirman entidades, revisión, snapshot, audit y receipt en una transacción. SQL verifica pertenencia, prioridades, evidencia y cambios sensibles además de las validaciones del dominio. El commit no hace red, IA, Storage, Shopify ni Meta. Timeouts permiten repetir la misma clave y recuperar el resultado original.

Cambiar un hecho revisado o su fuente/respaldo requiere verify y una revisión explícita del hecho con motivo. Los receipts de esos cambios también requieren verify al reproducirse, incluso si después cambian los permisos. El hecho conserva huella del contenido/respaldo, actor y fecha de revisión; un proposal unverified/pending no lleva metadata de verificación. Una contradicción nueva se puede aportar con write: no reescribe la aprobación histórica y restringe el uso vigente.

## Estrategias

`pi_strategy_versions` guarda el cierre completo e inmutable de una decisión. `pi_strategy_events` es el historial append-only de draft, selección, sustitución y archivo. El puntero del agregado identifica una única seleccionada. Los eventos ya registran quién/cuándo/por qué/revisión; no se añade otra tabla de selecciones con la misma capacidad.

Seleccionar crea versión y evento, sustituye la activa y registra superseded en la anterior. Archivar la activa limpia el puntero; ninguna prioridad elige otra automáticamente. Seleccionar contenido idéntico y vigente es no-op; draft nunca sustituye la activa. `analysis_revision=N` y `selection_revision=N+1` no provocan stale por sí mismas.

Stale compara las dependencias congeladas y la huella del contexto operacional; cambiar otra hipótesis o crear un draft no invalida una selección. Needs_review se calcula con restricciones de uso y estados actuales. Un snapshot histórico seleccionado no habilita ejecución si su selección ya se archivó/sustituyó hoy. Las respuestas core proyectan los auxiliares; execution conserva el cierre completo. Selección no significa ganador ni transforma epistemic_status.

Ofertas usan la calculadora/precios/etiquetas aprobadas existentes. Sin precio se pueden guardar análisis y ofertas incompletas; readiness informa faltantes. Cambiar precios/policies/base produce divergencia y oferta stale en lectura, sin reescribir el snapshot elegido ni publicar. Los inputs y los precios no se duplican en otra calculadora.

## Lecturas y compatibilidad

El runtime anuncia siete tools: las seis de conocimiento del spec más save_product_context. Generación/status siguen cerrados hasta implementar jobs y consumidores. UI/MCP usan el mismo ejecutor; la UI accede por `lib/data/product-intelligence.ts`.

Full entrega registros completos; summary ofrece IDs/resúmenes/conteos. Page_size limita items totales entre bloques, ordenados por prioridad/ID. Cursores HMAC tienen dominio propio, usan OAUTH_STATE_SECRET, ligan actor/dueño/producto/include/view/filtros/tamaño/revisión y vencen a los 15 minutos. Reautorizar siempre; una página siguiente usa el snapshot fijado aunque la cabeza avance. Las notas metodológicas se recuperan en research.summary; sin notas, ese campo resume conteos. Las restricciones actuales acompañan los hechos/dependencias expuestos en esa página; no se presentan estados actuales como contenido histórico.

La migración envuelve el snapshot operacional conservado con conocimiento/selección. Snapshots anteriores se leen como conocimiento vacío; los triggers comparan ese formato normalizado para no crear revisiones por el cambio de formato. No se reescriben revisiones antiguas ni se importa análisis legacy. Los RPC de contexto también vuelven a comprobar autorización después del lock del producto.

Límites de V1: 1.000 registros por tipo y 1 MiB de grafo completo; inputs 256 KiB/campo 8 KiB, snapshots de estrategia 256 KiB y resultado de mutación 60.000 bytes. La paginación reserva presupuesto para structuredContent y texto idéntico del SDK; si un registro/estrategia no cabe se devuelve RESPONSE_TOO_LARGE, sin cortar campos. Retrieved_at se normaliza a UTC con precisión de milisegundos. Aún no se midieron latencias/locks con volumen de piloto.

Las referencias internas comprobadas son product_reference_image y product_review del mismo dueño/producto. Asset y merchant_note no tienen aún un registro canónico resuelto: se rechazan; las fuentes HTTPS no se descargan. PDP/assets/performance continúan unknown hasta integrar su procedencia/snapshots; no se atribuyen resultados legacy a la nueva estrategia.

## Borrado, despliegue y verificación

Toda tabla nueva cae por cascada desde el producto. La inmutabilidad admite el borrado obligatorio del producto. La marca de borrado bloquea reads, writes y replays de conocimiento; los generadores conservados todavía deben respetarla antes de habilitar generación por MCP.

Aplicar OAuth/contexto/conocimiento antes del nuevo código, únicamente en un despliegue autorizado. Para rollback operativo, apagar MCP y revertir handlers/loaders compatibles; conservar tablas, eventos, revisiones y receipts. No retirar el wrapper de snapshots con consumidores vivos ni eliminar datos para revertir código. La UI de precio depende de la migración de contexto aun con MCP apagado.

Pruebas: `knowledge.test.ts` valida decisiones/readiness/proyecciones/cursor; `knowledge.local.test.ts` confirma grafo/estrategias/replay/CAS/rollback/RLS/cascadas con dos comerciantes ficticios. `persistence.local.test.ts` usa OAuth nativo y SDK Streamable HTTP para persistir/reproducir research y comprobar revocación/expiración. La prueba Next/Playwright descubre las siete tools y conserva consentimiento/revocación/precio UI/aislamiento. Los fixtures se eliminan; no se gastaron créditos ni se tocó producción.

Pendiente: outbox/generation_requests/provenance, adaptación de landing/UGC/Meta a GenerationContext, revisión/publicación UI, retirada del análisis viejo, OAuth hosted y cliente remoto real.
