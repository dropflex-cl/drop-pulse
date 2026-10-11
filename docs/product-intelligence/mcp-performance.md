# Rendimiento del MCP

Auditoría local del 11 de octubre de 2026 sobre el transporte, discovery, servicios, RPC y medios. Conserva los 65 contratos públicos de entrada/salida, sus defaults, presupuestos, campos técnicos y errores de autorización. El cierre añade la migración compatible `20261215000000_mcp_read_projections.sql`, inicialmente aplicada exclusivamente en Supabase local. La aplicación posterior en producción fue autorizada expresamente y se registra al final. No hubo llamadas a proveedores pagados.

## Mejoras implementadas

| Recorrido | Trabajo anterior | Cambio |
| --- | --- | --- |
| Creación de servidor por petición HTTP | Convertía todos los schemas Zod a JSON Schema en cada instancia | Una conversión por runtime; el principal y las flags siguen siendo propios de cada petición |
| `tools/list` | Serializaba repetidamente toda la página acumulada para calcular su tamaño | Tamaños UTF-8 de contratos estáticos y suma exacta de comas y envelope; mismos cortes y cursores |
| `get_shopify_automation` | Dos lecturas autorizadas consecutivas del mismo estado | Una lectura; conserva preflight de contenido, conexión, publicación y fingerprint |
| `get_visual_ingestion_status` | Firmaba referencias, descargaba la base, calculaba hash/metadatos y construía todos los destinos | Lee los mismos tokens y operación autorizados sin hidratar medios ni destinos |

La caché contiene exclusivamente esquemas y sus tamaños. Nunca contiene contenido comercial, URLs firmadas, resultados de tools, identidades, grants ni permisos. `publishedSchemas()` sigue devolviendo objetos independientes para exportación. Discovery copia profundamente sus objetos antes de entregarlos, incluso con transportes en memoria. Las escrituras conservan las comprobaciones transaccionales, CAS, receipts, idempotencia y reautorización existentes.

## Medición reproducible

```bash
node --conditions=react-server --import tsx scripts/pi-performance.ts
```

Comparación contra `73c8e2c` usando el mismo script, Node 22.23.3 y ejecuciones separadas en el equipo local: 30 construcciones y 10 recorridos completos de discovery. El caso HTTP usa el transporte oficial stateless y crea un servidor por página, como el runtime operativo. Excluye red, autenticación, base de datos y arranque/importación del proceso. Las cifras son mediciones de componentes locales, no latencia de producción ni SLA.

| Medición | Antes: mediana / p95 | Después: mediana / p95 |
| --- | --- | --- |
| Construcción con runtime caliente | 20,96 / 24,66 ms | 0,087 / 0,194 ms |
| Discovery HTTP stateless completo, 6 páginas | 143,37 / 152,71 ms | 7,88 / 9,12 ms |
| Discovery con un servidor en memoria y cliente SDK | 189,41 / 219,96 ms | 194,35 / 203,57 ms |

Primera construcción: 43,58 ms antes y 39,57 ms después. No se demuestra una mejora significativa en el recorrido del cliente SDK en memoria: incluye compilación/validación de contratos en el cliente y no reconstruye el servidor por petición.

Antes y después son idénticos: 65 tools, 6 páginas, orden, cursores y contenido de discovery. SHA-256 de contratos: `aa633dca028ced5095163c0ea15135d63085502ecf7d6f57e564d72ad5d8211a`. SHA-256 de las páginas recibidas por el cliente: `141e0a0a01c8857545463fff8db40534f6f35563dde5a4baac97431fa2e9133e`. El script también comprueba igualdad semántica entre HTTP y memoria.

## Cierre de los cuatro gaps

| Gap | Implementación y evidencia |
| --- | --- |
| Lecturas específicas | `pi_read_visual_operation`: una RPC autorizada devuelve revisión, etag, stamp y los siete campos usados del estado de ingestión. No consulta versiones/archivos ni construye conocimiento para el lector ni escribe snapshots; tampoco transfiere fuentes o credenciales de la operación. `pi_read_visual` separa historia explícita, lectura vigente y paginación. Workbench UI, selección, revisión y validación de publicación usan la lectura vigente. Pruebas comparan tokens y estado hidratado con el lector anterior. |
| Firmas por lotes | `createVisualUrlSigner` reúne solicitudes en una microtarea por bucket, deduplica rutas y asocia resultados por `path`, conservando el orden original. Pertenece a un estado autorizado mediante un símbolo no enumerable; otra lectura crea otro firmador. Pruebas con Storage real y mocks cubren archivos compartidos, buckets distintos, respuestas reordenadas, objetos ausentes, respuestas incompletas y fallos de bucket/red. |
| Landing por componente | `pi_read_landing_component` devuelve una fila, precios, políticas, reseñas, catálogo y el acento dentro de la lectura autorizada. Conserva el etag del conjunto sobre **todas las columnas de todas las filas vigentes, en el orden anterior**. No construye contexto o grafo de conocimiento. `listing` elimina la segunda consulta de acento. Las escrituras mantienen `pi_load_landing`, validación de hechos, reseñas, importes, políticas, imágenes y CAS. La respuesta pública completa se compara entre los lectores para tres componentes y ambas interfaces internas. |
| Telemetría | `http-runtime.ts` inyecta `after()`; Next/Vercel mantienen el lifetime con `waitUntil`, incluso después de entregar la respuesta. Fuera de ese runtime se espera la persistencia. Ingestión entrega eventos en orden mientras realiza la copia/commit y espera la cola en `finally`. Se conserva el evento, reautorización, timeout de 3 s, límite por hora e idempotencia. El evento completo sigue en el log; otro registro informa `persisted` y `telemetry_ms`, también ante fallos. La auditoría transaccional de cambios permanece síncrona. |

### Costos que deben conservarse

`dependency_stamp` es `pi_snapshot_hash(pi_visual_source_state(...))`. Ese estado incluye contexto, PDP, referencias, galería, creativos, guiones, tomas y registros vigentes. Calcularlo desde una proyección o una revisión almacenada produciría otro token o uno desactualizado. Por eso todavía se materializa **transitoriamente en SQL** para obtener el hash completo; se evita traer historia y archivos que no participan de ese hash, transferir el estado completo y guardarlo en consultas sin paginación. No se declara eliminado ese costo residual.

`pi_visual_source_state` comparte una única lectura de contexto con `pi_pdp_state_with_snapshot`. El wrapper anterior `pi_pdp_state` conserva firma, representación y ACL. `pi_read_visual` reutiliza ese mismo snapshot para conocimiento; no vuelve a ejecutar `pi_load_knowledge`. La prueba ejecuta las expresiones SQL anteriores y compara tanto el objeto completo como su hash. `pi_load_knowledge` conserva su contrato y sus consumidores de contexto/estrategia, revisiones históricas, permisos y escrituras.

La respuesta pública de `get_landing_content` exige `image_catalog`, `approved_reviews`, `review_count`, precios y políticas, incluso para un componente. No corresponde suprimirlos o limitar más su catálogo: cambiaría el contrato. También deben agregarse todas las filas para el etag global. La proyección evita construir/transmitir las demás filas y conocimiento para el lector; conserva estos datos exigidos. Las filas y variantes siguen siendo las de `page_components`, compartidas con UI y `effectivePage`; no hay una segunda fuente de verdad.

### Snapshots y compatibilidad

Solo las tools cuyo contrato admite cursor crean snapshots. Se determina desde el **schema**, incluso si el primer input omite `cursor`. El historial de versiones solo se carga con una versión histórica explícita; el historial de iteraciones sigue leyendo sus registros actuales y reseñas. Se conserva toda la historia almacenada.

Los snapshots conservan tabla, actor, TTL de 900 s, datos estables, orden y cursores firmados. Se reserva el UUID antes del INSERT: una escritura en lugar de INSERT + UPDATE. Cada continuación reautoriza scopes/grant/revocación y comprueba propiedad, eliminación y expiración. Los lectores anteriores y nuevos pueden continuar snapshots de ambos orígenes; el envelope de conocimiento anterior permanece en las páginas por compatibilidad. Pruebas con 30 assets verifican los valores y orden a través de una edición concurrente, sin duplicados, y rechazo después de expirar o retirar un archivo.

No se añaden tablas, assets, cachés comerciales ni índices de negocio. La eliminación sigue usando las cascadas existentes de `pi_visual_read_snapshots` y auditoría. Las RPC y firmas anteriores permanecen disponibles. Las RPC nuevas son exclusivas de `service_role`; los helpers internos tampoco pueden invocarse directamente con ese rol. No se modifican auth, RLS, grants anteriores, receipts, leases, CAS ni publicación.

Antes de usar el código nuevo en otro entorno se necesita esta migración y las anteriores del repositorio; **al cerrar las pruebas locales no se había aplicado en producción ni subido el código**. El stack local tenía pendientes `20261211000000_current_product_content.sql` y `20261214000000_current_ugc_keyframe_targets.sql`; se aplicaron localmente para probar la experiencia vigente. La migración de proyecciones también se ejecutó repetidamente en una transacción local al validar su definición final, sin resetear datos ajenos.

## Cobertura de la primera optimización

- Discovery se compara con el algoritmo anterior de paginación; respeta el presupuesto UTF-8 y los cursores inválidos.
- Modificar esquemas/anotaciones recibidos o exportados no altera otras respuestas ni otros comerciantes.
- La caché no amplía las tools habilitadas para otra petición; una tool fuera del catálogo no se ejecuta.
- La consulta de Shopify hace exactamente una lectura; conserva faltantes, autorización inactiva y requisitos reales.
- Integración Supabase local: estado de ingestión conserva revisión/etag/stamp aun cuando las funciones de lectura, descarga y firma de fotos fallan. Rechaza otro comerciante, scopes insuficientes y operaciones inexistentes.
- Los contratos generados se vuelven a exportar y validar, sin diferencias con los archivos existentes.

Verificaciones ejecutadas: suite Product Intelligence (305 pruebas correctas, incluida la prueba de aislamiento del catálogo), suite MCP (13 correctas), integración local visual/contenido vigente/Shopify (29 correctas), TypeScript, lint de todos los archivos del cambio, tokens y exportación/validación de contratos. Compilación de producción con `npm run build -- --webpack`: correcta. Turbopack no pudo completar la transformación CSS porque el entorno deniega abrir su puerto auxiliar; no se cambió la configuración de compilación.

Webpack terminó con código 0, aunque emitió avisos de `cookies()` durante el prerender de rutas API de onboarding y anuncios, fuera de los archivos modificados.

La suite general tuvo 1204 pruebas correctas y dos fallos en `components/store-preview/previews.test.tsx` sobre `review-stars`. Ambos se reprodujeron en una copia de `73c8e2c`, sin estas modificaciones. El lint global también encuentra errores en archivos ajenos a este cambio, incluidos el tema Shopify y la caché local de Whisper; el lint de los archivos modificados está limpio.

## Mediciones del cierre

La línea base se capturó **antes de editar**, usando las RPC conservadas, en `output/pi-performance/baseline.json`; los resultados iniciales de pruebas/contratos están en la misma carpeta. Para el cierre se enriquecieron las fixtures y se ejecutaron ambos modos del mismo script sobre la definición SQL final: `legacy-final.json` y `optimized-final.json`. Esta comparación es conservadora: ambos modos ya comparten la optimización de `pi_visual_source_state`; no atribuye a las proyecciones el ahorro de esa refactorización. No se comparan cifras entre fixtures o runtimes distintos.

Supabase local, Node 24.19.0, 25 muestras por operación y fixture. Las fixtures son un producto vacío; uno con contexto, precios, conocimiento, todos los componentes y tres referencias; otro con 80 referencias; otro con 500 versiones de unos 8 KB; y otro con 30 versiones y edición posterior de un componente oculto. Son fixtures de lectura; no implican una tienda conectada ni una publicación. Cada ejecución crea su usuario/filas/archivos y los elimina al terminar. No carga `.env.local`, exige `127.0.0.1:55321` y obtiene claves del stack local.

```bash
node --conditions=react-server --import tsx scripts/pi-read-performance.ts > output/pi-performance/legacy-final.json
node --conditions=react-server --import tsx scripts/pi-read-performance.ts --optimized > output/pi-performance/optimized-final.json
node --conditions=react-server --import tsx scripts/pi-telemetry-performance.ts > output/pi-performance/telemetry.json
node --import tsx scripts/pi-local-tests.ts lib/product-intelligence
```

Latencia de la llamada local a PostgREST/Storage **incluida la lectura y deserialización JSON del SDK**; excluye la transformación adicional de prueba, que se mide aparte. No es el tiempo de una tool MCP completa con autenticación, descarga de base, Zod y transporte del cliente. No mide red ni p95 de producción. Las consultas contadas son viajes HTTP a PostgREST, no cada SELECT interno de una RPC.

| Fixture | Operación | Antes: mediana / p95 ms | Después: mediana / p95 ms |
| --- | --- | --- | --- |
| Vacío | Visual vigente | 5,34 / 11,59 | 4,17 / 6,88 |
| Vacío | Estado de ingestión | 7,75 / 9,26 | 3,82 / 4,48 |
| Vacío | Componente de landing | 3,67 / 4,39 | 2,77 / 3,20 |
| Vacío | Listing | 6,75 / 8,48 | 2,94 / 3,55 |
| Completo | Visual vigente | 7,37 / 8,73 | 5,60 / 6,65 |
| Completo | Estado de ingestión | 8,03 / 8,84 | 4,83 / 5,94 |
| Completo | Componente de landing | 2,49 / 3,53 | 3,17 / 4,72 |
| Completo | Listing | 4,09 / 6,11 | 2,46 / 3,28 |
| Completo | Firmas | 2,40 / 7,22 | 1,50 / 1,74 |
| 80 imágenes | Visual vigente | 8,07 / 11,08 | 5,29 / 6,34 |
| 80 imágenes | Estado de ingestión | 9,65 / 11,19 | 3,30 / 3,63 |
| 80 imágenes | Componente de landing | 3,01 / 3,72 | 1,89 / 2,42 |
| 80 imágenes | Listing | 4,15 / 5,06 | 1,83 / 2,16 |
| 80 imágenes | Firmas | 27,07 / 42,38 | 3,47 / 11,16 |
| 500 versiones | Visual vigente | 41,30 / 68,16 | 3,37 / 4,41 |
| 500 versiones | Estado de ingestión | 38,65 / 49,46 | 2,67 / 4,10 |
| 500 versiones | Componente de landing | 3,19 / 3,98 | 1,66 / 2,13 |
| 500 versiones | Listing | 3,86 / 6,86 | 1,77 / 2,26 |
| 500 versiones | Firmas | 3,59 / 9,74 | 1,42 / 2,68 |
| Editado | Visual vigente | 7,33 / 9,18 | 3,23 / 3,48 |
| Editado | Estado de ingestión | 8,55 / 18,62 | 2,79 / 3,20 |
| Editado | Componente de landing | 2,62 / 6,69 | 1,62 / 1,91 |
| Editado | Listing | 5,85 / 11,81 | 1,52 / 2,20 |
| Editado | Firmas | 2,51 / 4,66 | 1,27 / 2,38 |

En el componente de la fixture completa, la mediana local subió de 2,49 a 3,17 ms y el p95 de 3,53 a 4,72 ms; no se declara mejora de latencia en ese caso. Sí se elimina la transferencia y construcción de conocimiento/filas innecesarias. En los demás casos medidos el ahorro aumenta con historia o imágenes; estos resultados locales no garantizan mejoras de red de producción.

| Recorrido | Viajes PostgREST antes → después | Storage antes → después | Snapshots nuevos antes → después |
| --- | --- | --- | --- |
| Visual vigente | 1 → 1 | 0 → 0 en la RPC | 1 → 0 |
| Estado de ingestión | 2 → 1 | 0 → 0 | 1 → 0 |
| Componente de landing | 1 → 1 | 0 → 0 | 0 → 0 |
| Listing | 2 → 1 | 0 → 0 | 0 → 0 |
| Firma de referencias | 0 → 0 | 3 → 1 o 80 → 1 | 0 → 0 |
| Primera página visual | 1 → 1 | por bucket/archivos distintos | 1 → 1; INSERT + UPDATE → INSERT |

Bytes de cuerpo recibidos por lectura (promedio redondeado; UUID/fecha pueden variar unos bytes). «Materializado» es el JSON del resultado de la RPC en JavaScript, medido sin firmar ni transformar el estado de dominio; **no** representa memoria pico ni todo el trabajo transitorio de PostgreSQL. El estado completo para el hash y las filas del etag global siguen materializándose en SQL como se explicó arriba.

| Fixture | Operación | Bytes transferidos antes → después | Bytes materializados en JS antes → después |
| --- | --- | --- | --- |
| Vacío | Visual vigente | 6.405 → 2.382 | 5.899 → 2.213 |
| Vacío | Estado de ingestión | 7.192 → 424 | 6.658 → 404 |
| Vacío | Componente de landing | 1.358 → 784 | 1.250 → 725 |
| Vacío | Listing | 1.386 → 784 | 1.275 → 725 |
| Completo | Visual vigente | 70.899 → 32.015 | 68.016 → 30.151 |
| Completo | Estado de ingestión | 71.686 → 423 | 68.776 → 403 |
| Completo | Componente de landing | 29.070 → 3.264 | 27.391 → 3.026 |
| Completo | Listing | 29.098 → 2.860 | 27.416 → 2.633 |
| 80 imágenes | Visual vigente | 167.741 → 96.220 | 158.160 → 90.044 |
| 80 imágenes | Estado de ingestión | 168.528 → 424 | 158.919 → 404 |
| 80 imágenes | Componente de landing | 43.773 → 8.731 | 41.016 → 8.185 |
| 80 imágenes | Listing | 43.801 → 8.327 | 41.041 → 7.792 |
| 500 versiones | Visual vigente | 4.452.816 → 32.025 | 4.445.461 → 30.161 |
| 500 versiones | Estado de ingestión | 4.453.603 → 423 | 4.446.220 → 403 |
| 500 versiones | Componente de landing | 29.020 → 3.264 | 27.341 → 3.026 |
| 500 versiones | Listing | 29.048 → 2.860 | 27.366 → 2.633 |
| Editado | Visual vigente | 308.934 → 32.030 | 305.808 → 30.164 |
| Editado | Estado de ingestión | 309.721 → 424 | 306.567 → 404 |
| Editado | Componente de landing | 29.084 → 3.279 | 27.404 → 3.040 |
| Editado | Listing | 29.112 → 2.860 | 27.429 → 2.633 |

La respuesta cruda de firma por lote contiene metadatos/path y alias adicionales del SDK: con 80 archivos transfiere 35.340 → 44.531 bytes y materializa 38.061 → 82.431 bytes; con tres, 1.320 → 1.663 y 1.423 → 3.079. El lector consume solo las URLs, conserva su respuesta pública y reduce 80 solicitudes a una. No se atribuye una reducción de bytes a la firma por lote.

Volumen de snapshot por lectura visual vigente/estado de ingestión antes: vacío ~6.405 bytes JSON / 2.013 bytes almacenados; completo ~70.899 / 16.704; 80 imágenes ~167.741 / 48.571; 500 versiones ~4.452.816 / 140.053; editado ~308.934 / 23.446. Después: **cero** en ambos recorridos. El tamaño lógico usa `octet_length(snapshot::text)`; el almacenado usa `pg_column_size(snapshot)` y no incluye índices/WAL. Los totales se agregan dentro de SQL para no descargar snapshots durante la medición. La paginación mantiene un snapshot estable por primera página; la prueba usa `pg_stat_xact_user_tables` para verificar una escritura, sin UPDATE.

| Transformación aislada, estado de ingestión con 500 versiones | Antes: mediana / p95 | Después: mediana / p95 |
| --- | --- | --- |
| Conteo de bytes + stringify/parse del resultado, ms | 5,37 / 6,53 | 0,01 / 0,01 |

Las demás duraciones de transformación están en los JSON. Este microbenchmark no mide Zod, hashing de imágenes ni una transformación completa; no se suma su ahorro al tiempo de red. La lectura vigente conserva la descarga y hash de la base cuando el consumidor los necesita.

### Telemetría y tiempo visto por el cliente

`pi-telemetry-performance.ts` mide un cliente HTTP real en loopback con el transporte MCP oficial, una lectura controlada de 5 ms y una persistencia de 40 ms. Se compara esperar la misma persistencia con registrarla para después de responder; 25 muestras más warmup, drenando los callbacks antes de terminar. Es un experimento de ruta crítica, **no una estimación de producción ni una medición de after() en Vercel**. La prueba de `http-runtime.ts` verifica que se registra el callback de Next y el cuerpo llega antes de persistir; la integración DB verifica que ese callback escribe auditoría una vez y no cambia tokens.

| Duración separada | Antes: mediana / p95 ms | Después: mediana / p95 ms |
| --- | --- | --- |
| Ejecución de operación | 6,00 / 7,00 | 6,00 / 7,00 |
| Total observado por el cliente HTTP | 52,21 / 54,71 | 11,41 / 12,62 |
| Persistencia de diagnóstico | 41,08 / 41,31 | 40,88 / 41,81 |

Ambos modos entregaron **26/26 eventos**. En el runtime, `duration_ms` mantiene la semántica de ejecución anterior; `server_response_ms` mide el handler hasta obtener Response, sin llamarlo latencia del cliente; `telemetry_ms` y `persisted` informan la entrega separadamente. No hay una métrica de latencia de cliente de producción. Fallos/timeouts quedan en el log completo del evento y en la marca de entrega fallida; no se añade un reintento ni se pierde una promesa al cerrar la petición.

## Verificación final y límites

| Verificación | Resultado |
| --- | --- |
| Línea base antes de editar | 305 pruebas Product Intelligence correctas; contratos exportados/validados; fixtures y métricas guardadas |
| `npm run pi:contracts` | 65 pares input/output sin diff; mismos hashes de contratos y discovery |
| Integración local Product Intelligence | 473 correctas, 2 omitidas de navegador (`PI_UI_TEST`); RPC, Storage, revocación, shared current content, concurrencia, receipts/leases y auditoría incluidos |
| Nuevas proyecciones | 11 pruebas locales correctas: SQL/hash exacto, historia, snapshots cruzados/expiración, escrituras, edición concurrente, landing equivalente, auditoría, aislamiento y errores de archivo |
| Transporte/firma/diagnóstico | 8 pruebas nuevas correctas; entrega antes de persistir, asociación/deduplicación y fallos verificables |
| `npm run typecheck` | Correcto |
| ESLint de todos los TS modificados/nuevos | Correcto |
| `npm run check:valores` | Correcto |
| `npm run build -- --webpack` | Correcto; avisos anteriores de cookies en API onboarding/ads |
| `npm run build` | Turbopack falla por puerto auxiliar denegado (`Operation not permitted`), limitación del entorno ya presente |
| `npm test` | 1.215 correctas, 172 omitidas; dos fallos previos de `review-stars` |
| `npm run lint` | 570 errores y 5 warnings fuera de los TS modificados; checkout previo limpio de artefactos reproduce 139 errores y 5 warnings; 431 adicionales proceden de `.cache` local existente |

Los dos fallos de `components/store-preview/previews.test.tsx` se reprodujeron sin el cambio en una copia de `bc5a80b` (81 correctas, los mismos dos fallos). Se conserva el log de reproducción y del lint anterior. No se corrigieron archivos ajenos para ocultar estos fallos. No se ejecutó la suite de navegador opt-in; las pruebas locales de contenido vigente comprueban ediciones por UI/store y MCP y sus lectores efectivos, y no se cambió marcado ni estilos de UI.

Evidencia por requisito: contratos/equivalencia (`landing.test.ts`, `read-projections.local.test.ts`, contracts/discovery); menos solicitudes/escrituras (`visual-performance.test.ts`, conteos del benchmark y estadísticas transaccionales); UI/MCP (`current-content.local.test.ts`); paginación/expiración (`read-projections.local.test.ts`); merchant/scopes/revocación/ACL (`read-projections.local.test.ts`, `persistence.local.test.ts`); archivos/fallos parciales (`visual-performance.test.ts`, Storage local); CAS, idempotencia y leases (suites `visual.local`, `persistence.local`, `current-content.local`, `shopify-automation.local`); telemetría (`http-runtime-performance.test.ts`, `visual-performance.test.ts`, auditoría local); compatibilidad SQL/lectores cruzados (`read-projections.local.test.ts`).

Al cerrar la implementación, la migración final estaba aplicada solo al stack local y los lectores anteriores permanecían invocables. Producción se mantuvo en solo lectura durante ese trabajo; no se publicaron productos, no se crearon generaciones ni se gastaron créditos. No quedan gaps de implementación abiertos dentro de este alcance; quedan los costos necesarios y las limitaciones de verificación explicitados arriba.

## Aplicación posterior en producción

El usuario autorizó expresamente hacer commit, push a `main` y aplicar las migraciones pendientes. El commit funcional `3a075c0` se subió a `origin/main` antes de ejecutar la migración. `supabase db push --linked --dry-run` identificó únicamente `20261215000000_mcp_read_projections.sql`; `supabase db push --linked --yes` la aplicó correctamente al proyecto `oukcswnfrzroxgwqmujf`, sin seeds ni roles adicionales. Un segundo dry-run confirmó `upToDate: true` y ninguna migración pendiente; el historial local/remoto coincide en las 80 versiones, hasta `20261215000000`.

Se compararon dumps del esquema `public` antes/después, sin extraer datos comerciales ni ejecutar tools de negocio: cinco funciones internas nuevas, dos funciones modificadas (`pi_pdp_state`, `pi_visual_source_state`), ninguna eliminada y el resto del esquema idéntico. Las tres RPC nuevas tienen EXECUTE solo para `service_role`; los dos helpers no tienen EXECUTE para clientes ni `service_role`. Los permisos anteriores, tablas, RLS, índices, triggers y FK permanecen idénticos. La comparación de esquema no pretende medir latencia o validar una sesión comercial de producción.

[Evidencia de la aplicación y permisos](production-mcp-performance-2026-10-11.json). El push puede activar el despliegue integrado de Vercel; este registro confirma Git y base de datos, no el estado final de ese despliegue. No hubo publicaciones Shopify/Meta, generaciones ni consumo de créditos.
