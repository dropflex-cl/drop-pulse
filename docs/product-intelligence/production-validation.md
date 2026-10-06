# Validación de producción en solo lectura

Nota de alcance posterior: los hallazgos siguientes siguen siendo evidencia del estado observado. Las recomendaciones de backfill/compatibilidad semántica pertenecían al plan anterior y fueron sustituidas por [ADR 006](adrs/006-chat-first-optimization.md): análisis nuevo desde chat, sin importar los payloads legacy. Se conservan precios, piezas, publicación y Meta.

Consulta autorizada por el usuario el 2026-10-06. Proyecto vinculado: `oukcswnfrzroxgwqmujf`, región `sa-east-1`, estado observado `ACTIVE_HEALTHY`. Ventana de consultas: **10:35–10:45 UTC / 07:35–07:45 America/Santiago**. Baseline de código: `a2c272729b0299f4b073bbd3db2b54b661791aa5`.

## Método y límites

Se usó Management API, endpoint [`database/query/read-only`](https://supabase.com/docs/reference/api/v1-read-only-query), con el token ya configurado localmente. PostgreSQL devolvió `current_user=supabase_read_only_user`, `transaction_read_only=on`, versión 17.6. El rol tiene BYPASSRLS, sin superuser: los conteos abarcan los datos disponibles sin simular una sesión de comerciante. No se ejecutaron funciones de negocio, migraciones, escrituras, generación IA, descargas de archivos ni cambios de permisos/configuración.

Se consultó la totalidad actual del catálogo: ocho productos de un dueño. Alias P01–P08 son posiciones del snapshot por created_at/id; no identificadores de negocio ni IDs que deban reutilizarse. Los informes contienen metadatos, formas JSON, conteos y timestamps; no emails, nombres/títulos de productos, textos de reseñas, URLs privadas, UUIDs de usuarios/productos, tokens ni payloads completos.

Cada query tiene su propio snapshot; no se mantuvo una transacción global durante diez minutos. El recuento final de productos, fichas, avatares, rankings, desarrollos, strategy_runs y objetos Storage coincidió con el inicial. No demuestra ausencia de ediciones dentro de filas durante la ventana. Los hashes y resultados agregados se conservan en [production-validation-results.json](production-validation-results.json); las consultas ejecutadas en [production-readonly-queries.sql](production-readonly-queries.sql), fuera de `supabase/migrations`.

La revisión automática rechazó una solicitud de export de payloads completos por sensibilidad del contenido. Esa consulta no se ejecutó. Se sustituyó por SELECTs que validan estructuras dentro de PostgreSQL y devuelven únicamente conteos. No queda pendiente permiso de export para completar esta comprobación.

## 1. Esquema desplegado e integridad

| Comprobación | Resultado observado | Alcance |
|---|---|---|
| Tablas públicas | 52; mismos nombres resultantes del DDL del repo | `content_items` ausente; sin tablas de Product Intelligence/MCP nuevas. |
| Migraciones registradas | 36 versiones; ninguna local faltante ni extra remota | Igualdad de versiones, no comparación byte a byte del SQL aplicado. |
| RLS / policies | 52 tablas con RLS; policies observadas solo SELECT | Las policies concretas incluyen catálogos globales y reglas por dueño/admin según tabla. |
| FKs | 111 totales desde tablas públicas; 62 hacia tablas públicas, todas validadas | Sigue faltando composición dueño/producto en las relaciones relevantes. |
| Integridad de FKs públicas | 4.842 referencias comprobadas; 0 huérfanos, 0 owner mismatch y 0 cruces de producto en relaciones comparables | Referencias contadas por FK, no 4.842 filas distintas. No se consultaron filas de auth.users. |
| Identidad duplicada | 0 pares user/Shopify product duplicados; 0 identidades repetidas de reseña | Conteo de duplicados presentes, no garantía frente a writers futuros. |
| Imagen base | 0 productos con varias bases; 0 bases excluidas | No significa que todos hayan elegido base explícita; existe fallback. |
| Métricas sin FK de unit_id | 0 unidades sin resolver en 48 diarios y 3.258 snapshots | Se verificó campaña/dueño/unidad para campaign/adset/ad. |

Los roles anon/authenticated/service_role tienen grants SELECT/INSERT/UPDATE/DELETE sobre 52 tablas; las policies RLS de las tablas públicas observadas solo admiten SELECT. Grants de escritura por sí solos no permiten saltarse RLS. No se probó un write ni una sesión anon/authenticated. Cinco RPCs de negocio observadas no permiten EXECUTE a anon/authenticated, sí a service_role. `delete_user_tokens` mantiene EXECUTE público pero **retorna trigger** y es el hook de eliminación del usuario; no se ejecutó ni se clasifica como una RPC invocable para extraer tokens.

La ausencia actual de cruces no elimina el riesgo estructural: este dataset tiene un único dueño. Las FKs compuestas y tests con dos tenants siguen siendo aceptación obligatoria de V1. No se verificaron configuración OAuth productiva, validación bearer ni grants MCP, que aún no están implementados en el repo.

## 2. Cobertura por producto anonimizado

| Alias | Upsell | Product data | Precio | Fichas / avatares | Avatares aprobados | Rankings confirmados | Briefs de ángulo aprobados | Reseñas / aprobadas | Componentes actuales | Publicación guardada |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 | No | No | Sí | 2 / 2 | 1 | 1 | 2 | 7 / 7 | 14 | Sí |
| P02 | No | No | Sí | 3 / 3 | 2 | 2 | 5 | 14 / 10 | 16 | Sí |
| P03 | Sí | No | No | 0 / 0 | 0 | 0 | 0 | 0 / 0 | 0 | No |
| P04 | No | No | Sí | 1 / 1 | 1 | 1 | 3 | 10 / 6 | 16 | Sí |
| P05 | No | No | Sí | 1 / 1 | 1 | 1 | 3 | 0 / 0 | 0 | No |
| P06 | No | Sí | Sí | 1 / 1 | 1 | 0 | 0 | 47 / 14 | 17 | Sí |
| P07 | No | No | No | 0 / 0 | 0 | 0 | 0 | 0 / 0 | 0 | No |
| P08 | Sí | No | No | 0 / 0 | 0 | 0 | 0 | 0 / 0 | 0 | No |

«Publicación guardada» significa fila `product_publications.status=published`; no se hizo readback contra Shopify. «Product data» exige description no vacía en ese campo nuevo; no implica ausencia de ficha legacy ni que la tienda carezca de descripción.

P02 conserva dos avatares approved y dos rankings confirmados. `latestAvatars` toma el más reciente no rechazado (`lib/products/store.ts:221`); no demuestra duplicación accidental ni dos segmentos comerciales diferentes. Conservar ambas versiones históricas, mantener proyección vigente equivalente y solicitar completar relaciones antes de una selección nueva. No archivar/rechazar el anterior en esta auditoría.

P06 tiene una PDP/publicación guardada aunque no tiene ranking confirmado actual; no atribuir esa página a uno de los informes nuevos ni «reparar» su historial por fecha. La combinación debe estar en las fixtures de compatibilidad.

## 3. Formatos y faltantes concretos

Validación SQL estructural generada desde `productBriefSchema`, `customerAvatarSchema` y `angleBriefBaseSchema` del baseline: tipos, required, enums y arrays anidados. Campos extra se toleraron como el parse de objetos Zod existente. No se interpretó el texto, no se midió veracidad y no se ejecutó un parse de payloads productivos fuera de la DB.

| Entidad | Distribución | Incompatibilidad con schema actual | Regla de adaptación |
|---|---|---|---|
| Fichas | 8: v6×3, v7×1, v8×3, v9×1 | 3 v6 sin `differentiator`; otros required/types comprobados válidos | Vista de compatibilidad puede devolver null explícito con provenance missing; raw permanece idéntico. No inferir claim. |
| Avatares | 8: v4×7 (5 approved, 2 rejected), v6×1 approved | Los 7 v4 no tienen los siete campos nuevos además de summary | `readAvatar` para proyección; los tipos de sus campos legacy consultados cumplen precondiciones. Esto no valida personas/JTBD V1 ni elimina pérdidas del fallback. |
| Rankings | 7: v4×1, v5×1, v6×3 succeeded/confirmed; 2 failed sin payload | Mezcla de primary/secondary antiguos y chosen_angles de 2/3 slots | Conservar identidad de ranking/slot. Ni primary legacy ni slot bastan para reconstruir relaciones principales V1. |
| Desarrollos | 13: v2×4, v3×6, v5×3; todos approved | 4 v2 carecen de `page_block` y tienen `landing` legacy | Conservar landing raw; completar/adaptar page_block conscientemente. No convertir una página larga a una frase por simple rename. |
| Sources de competencia | 2 manual/succeeded con analysis object, en P05 | Datos presentes, writer retirado | Importar referencias/fragmentos como research no verificado; no reactivar scraping. |

Las ocho fichas contienen 76 items de `key_facts`; ninguna tiene IDs canónicos persona/JTBD/pain. Cuatro incluyen real_reviews no vacías en proof. Las ocho tienen inferred_fields no vacías; el caso nuevo de confirmación que las fuerza a [] aún no aparece en estos datos. Todo fact se importa unverified/pending hasta revisión individual, independientemente de ese campo.

Hay 78 reseñas: 37 approved, 33 in_review y 8 rejected. Cuatro approved no tienen original textual; tres tampoco tienen texto efectivo con el fallback real de `displayText` (`lib/reviews/rows.ts:44`). Las cuatro tienen fotos. Pueden conservarse como fuente de fotos/rating, pero las tres sin texto no generan CustomerLanguage.customer_quote ni se rellenan con copy IA. Ocho reseñas approved fueron editadas: preservar original, edición y naturaleza de la cita. Etiquetas de packs: 6 approved, 2 rejected, 1 generated.

## 4. Estado del flujo nuevo, PDP y métricas

Las dos `strategy_runs`, ambas en P06, están failed con `error_code=timeout` en paso report, duración 211 s, template_version 1 y 2. Reportes parciales: 30.206 y 34.828 caracteres; extraction=null y ninguna confirmada. No hay rankings vinculados a strategy_run; los checks de confirmación repetida/incompleta del flujo nuevo dan cero porque **no hay éxitos**, no porque se haya probado idempotencia. No se reintentó generación ni se gastaron créditos.

De 116 page_components, 63 están actuales: 55 approved (54 enabled) y 8 generated/deshabilitados. Otros 53 están superseded (27 approved, 26 generated). Existen cuatro filas de publicación, 11 copy_runs, seis creative_runs y nueve video_scripts. Esto respalda reutilización de ejecución; no crea un manifest PDP inmutable retrospectivo.

Performance: 3 campañas, 6 adsets, 6 ads, 48 diarios y 3.258 snapshots. Diarios abarcan 2026-09-26–29 y tres filas tienen purchases >0; no sumar esos tres niveles como ventas independientes. Última actualización diaria: 2026-10-03 03:05 UTC. Último snapshot: 2026-10-06 10:05 UTC, con fecha 2026-10-06; todas sus columnas today/lifetime son objetos. Diferenciar frescura de ambas fuentes y no inferir que todo sync está detenido por la fecha de daily. No se verificó contra Meta ni una fuente COD externa.

## 5. Assets y efectos sobre el plan

Los cuatro buckets son privados. En metadatos Storage hay 249 objetos: product-references 82, page-media 34, creative-media 113, ad-media 20. Las referencias comprobadas son: 4 imágenes base/referencia con storage_path, 78 fotos de reseña, 34 page_images, 12 creative_assets, 101 video_shots y 20 ad_media; no hay final_storage_path en video_scripts. Las restantes ocho referencias del producto usan URL en lugar de Storage; no se descargaron.

No aparecen objetos faltantes, prefijos de dueño/producto incompatibles, objetos sin referencia en esas entidades ni objetos sin producto vivo bajo los prefijos esperados. La comprobación usa `storage.objects`; no verifica bytes/checksums, entrega por CDN ni disponibilidad de archivos Shopify externos.

El diagnóstico empírico del dataset actual queda realizado. Se mantienen decisiones de almacenamiento, CAS/receipts y separación de hipótesis/selección. Ajustes obligatorios al backlog: fixtures de fichas v6, avatar v4/v6, landing legacy, reseñas sin texto, varias aprobaciones históricas y página publicada sin ranking actual. La integración actual del mega prompt necesita un éxito controlado/fixture equivalente antes de dar por probadas sus proyecciones; corregir timeouts es trabajo separado, no un write implícito de esta auditoría.

Persisten gates de implementación: pruebas transaccionales/RLS con dos tenants aislados, recuperación/backup en entorno de prueba, backfill reconciliado, cobertura de todos los escritores, proveedor OAuth/SDK/host y compatibilidad de ejecución. La población observada de un dueño/ocho productos sirve para descubrir formatos; no valida escala, seguridad multiusuario ni p95.
