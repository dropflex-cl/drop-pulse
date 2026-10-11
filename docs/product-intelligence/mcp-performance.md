# Rendimiento del MCP

Auditoría local del 11 de octubre de 2026 sobre el transporte, discovery, servicios, RPC y medios. Conserva los 65 contratos públicos de entrada/salida, sus defaults, presupuestos, campos técnicos y errores de autorización. No requiere migraciones. No se ejecutaron operaciones en producción ni llamadas a proveedores pagados.

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

## Oportunidades pendientes, por prioridad

1. **Lecturas SQL específicas para consultas pequeñas.** `pi_load_visual` construye el estado fuente completo, materializa conocimiento, historial y archivos, y escribe/actualiza un snapshot aunque solo se consulte una ingestión. La mejora de servicio evita I/O de fotos, pero conserva esta RPC para mantener los tokens exactamente iguales. Una RPC interna específica puede evitar devolver historial y persistir snapshots donde no se pagina; debe conservar autorización, eliminación, stamps y concurrencia. Las listas paginadas sí necesitan sus snapshots estables. Medir con productos con bastante historial antes de definir la migración.
2. **Firma de URLs por lotes.** `hydrateVisualState` firma cada referencia y `visualRecordView` firma cada archivo de una página. Algunas lecturas son paralelas, pero siguen siendo una llamada por archivo. Agrupar por bucket y deduplicar dentro de la petición reduciría llamadas a Storage. Mantener frescura, pertenencia y tratamiento de errores por archivo; no usar una caché global de URLs.
3. **Proyecciones de landing.** `get_landing_content` carga las filas, contexto y catálogo de imágenes de la página aunque se solicite un componente. Solicitar varios componentes repite ese trabajo; `listing` también consulta el acento. Proyectar en una RPC interna por componente, conservando el etag del conjunto y la validación de hechos/precios. No compartir datos entre peticiones sin invalidación correcta.
4. **Telemetría en la ruta crítica.** El servicio visual espera a `recordServerVisualEvent`, cuyo timeout llega a 3 s. Las duraciones registradas se calculan antes de esa espera, por lo que no representan toda la latencia de respuesta. Medir por separado; una cola durable o `after()` puede sacarla de la respuesta sin perder diagnóstico. No eliminar la auditoría para acelerar.

Estos son costos identificados en el código, no cuellos de botella cuantificados en producción. La siguiente medición útil es desglosar tiempo de RPC, Storage, transformación y telemetría para los mismos productos, en modo lectura y sin introducir contenido privado en logs.

## Cobertura de regresión

- Discovery se compara con el algoritmo anterior de paginación; respeta el presupuesto UTF-8 y los cursores inválidos.
- Modificar esquemas/anotaciones recibidos o exportados no altera otras respuestas ni otros comerciantes.
- La caché no amplía las tools habilitadas para otra petición; una tool fuera del catálogo no se ejecuta.
- La consulta de Shopify hace exactamente una lectura; conserva faltantes, autorización inactiva y requisitos reales.
- Integración Supabase local: estado de ingestión conserva revisión/etag/stamp aun cuando las funciones de lectura, descarga y firma de fotos fallan. Rechaza otro comerciante, scopes insuficientes y operaciones inexistentes.
- Los contratos generados se vuelven a exportar y validar, sin diferencias con los archivos existentes.

Verificaciones ejecutadas: suite Product Intelligence (305 pruebas correctas, incluida la prueba de aislamiento del catálogo), suite MCP (13 correctas), integración local visual/contenido vigente/Shopify (29 correctas), TypeScript, lint de todos los archivos del cambio, tokens y exportación/validación de contratos. Compilación de producción con `npm run build -- --webpack`: correcta. Turbopack no pudo completar la transformación CSS porque el entorno deniega abrir su puerto auxiliar; no se cambió la configuración de compilación.

Webpack terminó con código 0, aunque emitió avisos de `cookies()` durante el prerender de rutas API de onboarding y anuncios, fuera de los archivos modificados.

La suite general tuvo 1204 pruebas correctas y dos fallos en `components/store-preview/previews.test.tsx` sobre `review-stars`. Ambos se reprodujeron en una copia de `73c8e2c`, sin estas modificaciones. El lint global también encuentra errores en archivos ajenos a este cambio, incluidos el tema Shopify y la caché local de Whisper; el lint de los archivos modificados está limpio.
