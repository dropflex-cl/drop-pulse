# Limpieza final del código de análisis retirado

Solicitud del comerciante: eliminar el código deprecado y realizar la limpieza, después de activar PDP.

## Cambios

- Eliminados los schemas y adaptadores de generación de ficha/avatar, router/brief de ángulos y generador/selector de hooks. Sus únicos consumidores eran tests del pipeline retirado y otros módulos ahora eliminados.
- Eliminados el contexto de prompts, el bloque de precios para prompts y el helper de caché sin callers, el builder de schema holgado de página, la selección automática de componentes por posición y la reparación automática por partes.
- Preservados los contratos de packs/diferenciador en sus dominios, las huellas de campañas y los límites de apertura del video. Los contratos MCP derivados no cambian.
- Preservados los validadores vigentes, los payloads históricos de páginas/videos/campañas, los costos, Shopify y su fallback, Auth y los writers SQL internos llamados por wrappers vigentes.
- Retirados tests que solo comprobaban generadores eliminados; se mantienen tests de validación y se añaden guards de arquitectura y conteo de palabras de video.

No se incorporan los cambios previos de `lib/products/delete.ts`, `lib/product-intelligence/ugc.local.test.ts`, `AGENTS.md` ni el material de auditoría/output ajeno a este trabajo.

## Validación

Suite general tras retirar módulos: 969 tests pasan; dos tests nuevos posteriores pasan en una corrida enfocada de 57 casos. Typecheck, lint de los TS/TSX cambiados, tokens y build webpack pasan. Los 36 contratos se vuelven a derivar sin modificaciones en sus JSON. Product Intelligence con Supabase local y el flag PDP encendido: 335 tests pasan.

## Preparación de la contracción

Proyecto `oukcswnfrzroxgwqmujf`. Preflight: cero trabajos de análisis activos; cero filas en siete tablas retiradas y dos filas en `prompt_templates`. Cero productos, generaciones y etiquetas relacionadas. Se guardaron el schema público y los datos retirados en un directorio privado fuera de Git, con permisos restringidos y manifiesto SHA-256.

Se restauraron el schema público productivo y esos datos en una base aislada local. La cuenta y la huella de las dos plantillas restauradas coinciden con producción. Los prerequisitos de Auth vienen de Supabase local, sin sus triggers de ensayo; esta prueba certifica los objetos/datos públicos exportados y no representa una restauración de Auth productivo.

Sobre esa restauración, la migración exacta `20261118000000` pasó en una transacción de ensayo con fixtures de página, packs y costos: las huellas de 20 tablas operativas se conservaron y el snapshot operacional siguió disponible. La transacción se revirtió. Antes de producción se registraron además conteos/huellas de sus 77 tablas públicas conservadas, excluyendo exclusivamente las tres columnas que se retiran.

## Ejecución y resultado productivo

Commit funcional `b4955fd` publicado en `origin/main`. [Vercel](https://vercel.com/dropflex-cl/drop-pulse/8yUL7kjEXHxkrQw8QLvybHGQqgqJ) confirmó `success` / «Deployment has completed». Los lectores compatibles ya estaban desplegados antes de la contracción.

Un workspace temporal excluyó la migración independiente de crons 20261119. `supabase db push --linked --include-all --dry-run` seleccionó únicamente 20261118; `db push --linked --include-all --yes` la aplicó. El historial tiene 57 versiones reales, sin marcar como aplicadas versiones omitidas.

La [evidencia agregada](production-legacy-cleanup-2026-10-07.json) confirma:

- Ocho tablas, tres columnas y la RPC de prompts ausentes.
- Los conteos/huellas de las 77 tablas públicas conservadas coinciden antes y después.
- Los dos enums compartidos por contenido siguen presentes.
- PDP conserva default habilitado y RLS en sus tres tablas nuevas.

No se borró Storage, contenido operativo ni Auth, ni se ejecutaron renders/publicaciones. Las dos plantillas antiguas eliminadas están en el respaldo restaurado de ensayo. El respaldo privado permanece en `/Users/cquezada/.codex/backups/dropflex/legacy-cleanup-20261007-092605/`; no se incorpora al repositorio público. La base aislada de ensayo y el workspace temporal se retiraron al terminar; los archivos de restauración y logs se conservan.
