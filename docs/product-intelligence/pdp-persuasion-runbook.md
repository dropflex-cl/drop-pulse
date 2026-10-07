# PDP por ángulo: operación y validación

El despliegue inicial se desarrolló con ambos switches apagados. La activación autorizada posterior se versiona en `vercel.json` (`PDP_PERSUASION_ENABLED=true`) y en la migración `20261123000000` (productos actuales y nuevos habilitados). El switch de entorno y el de cada producto siguen permitiendo retirar la feature. Habilitarla no aprueba planes ni publica productos.

## Evidencia de esta iteración

- Suite general: 1.010 tests pasan; 106 casos opt-in se omiten en esa corrida.
- Product Intelligence con Supabase local, en serie: 335 tests pasan, incluidos los 102 casos locales de persistencia/OAuth/integración.
- Runtime del kit en Chromium: cuatro tests pasan.
- Typecheck, contratos de 36 tools, lint de TS/TSX modificados, tokens y sincronización del kit pasan.
- Build de producción pasa con `npm run build -- --webpack`. El build Turbopack se interrumpe por una restricción del entorno al abrir su puerto interno para procesar CSS; no se cambió la configuración del proyecto.
- Theme Check termina sin errores, con 42 warnings existentes. ESLint global conserva 139 errores y tres warnings de archivos preexistentes del tema.

Los tests contra una única base local se ejecutan con `--fileParallelism=false`: la corrida paralela tuvo fallos transitorios; la corrida en serie pasó completa. Los resultados no certifican una tienda remota ni conversión.

## Preparación

1. Aplicar las tres migraciones 20261120–20261122 después de las migraciones canónicas existentes. La limpieza destructiva legacy 20261118 es independiente y no es requisito de PDP.
2. Para la activación autorizada, aplicar también 20261123 y desplegar la configuración versionada con el flag encendido. En futuros despliegues piloto, omitir esta activación y habilitar solo los productos seleccionados.
3. Actualizar el kit Shopify antes de publicar una experiencia, incluido `df-pdp-experience` y los wrappers de componentes. No mezclar archivos de distintas versiones. La app verifica la versión del kit al publicar.

## Recorrido MCP

1. Obtener estrategia seleccionada con `get_product_strategy`; revisar su readiness. Recuperar `get_pdp_planning_context(product_id, strategy_id, angle_id)`.
2. Escribir un plan schema 1.0 en el chat. Preferir de cinco a siete bloques; incluir una sola ficha comercial, entre cuatro y siete creencias y una contribución explícita por sección. Usar el catálogo real y contratos de `get_landing_content`.
3. Validar. Guardar draft con revisión, etag vacío obtenido del get, `expected_planning_stamp` de la lectura e idempotency key estable. `dry_run=true` no escribe ni reserva identidad.
4. Aprobar en el workbench merchant. El chat no aprueba ni activa. Si el plan ya tiene experiencia activa, crear otra variante de plan o archivar primero.
5. Guardar copy con los writers existentes. Schema 1.2 permite metadata de procedencia; 1.0/1.1 conservan su comportamiento. Para leer la metadata, solicitar `get_landing_content` con `schema_version: 1.2`; el get sin esa opción conserva exactamente su respuesta legacy. Decidir contenido/medios en sus editores actuales.
6. Obtener plan/experiencias otra vez. Crear experiencia con `plan_revision` exacta, bindings reales y hasta nueve secciones contando apoyos. Activar en UI una vez aprobados copy/assets y resueltos los beliefs obligatorios.
7. Publicar desde la etapa Publicar. Activación no cambia Shopify por sí sola. Comprobar `?angle=...`, `?angle=...&hook=...`, aliases legacy, ruta desconocida y página sin parámetros.

Ante conflicto, recuperar contexto y conciliar; no reenviar ciegamente con tokens frescos. Ante fallo de red, reintentar la misma carga y clave. Si cambias carga, usa otra clave. No mezclar `dry_run` con la expectativa de un receipt persistente.

Reordenar/deshabilitar/cambiar componente/copy/medios no recalcula Strategy. Los overrides indican campos protegidos. Para alterar una creencia o tesis, revisar el plan; para una arquitectura distinta, crear variante explícita. La arquitectura no se reconstruye al regenerar textos.

## Validación local

```sh
npm run pi:contracts
npm run typecheck
npm test
npm run check:valores
npm run shopify:components
npm run check:shopify
PI_LOCAL_TEST=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/product-intelligence --fileParallelism=false
PDP_BROWSER_TEST=1 node node_modules/vitest/vitest.mjs run lib/shopify/pdp-runtime.browser.test.ts
```

Supabase local debe estar en `http://127.0.0.1:55321` con las migraciones aplicadas. Los tests verifican esa URL antes de crear fixtures y limpian usuarios/clientes al terminar. Chromium debe estar instalado. No se realizan llamadas pagadas, renders externos, campañas ni publicaciones.

La suite global de ESLint falla por JavaScript preexistente del tema. Ejecutar también lint sobre los TS/TSX modificados; no corregir esa deuda como parte de esta feature. Theme Check acepta warnings existentes y debe terminar sin errores.

## Analytics y learning

`df:experience-selected` emite producto, strategy, angle, selectores públicos, plan, revisión de plan, experiencia, revisión y architecture variant. Los nodos muestran `data-df-section-key` y `data-df-persuasion-job`. Es trazabilidad para conectar un colector; esta iteración no atribuye ATC/checkout ni inventa visitas históricas.

`save_product_learning` schema 1.1 admite `execution` con IDs/revisiones/architecture y sección opcional. Se comprueba contra snapshots históricos. Mantener `measurement_attribution: product_campaigns_only`, expresar límites y no declarar winner o causalidad automáticamente.

## Rollback

Apagar flag por producto/entorno oculta el workbench y deshabilita tools nuevos. Para retirar la ejecución de una tienda ya publicada, republicar el producto con la feature apagada, lo que elimina `dropflex.landing_experiences`; alternativamente retirar ese metafield de forma explícita. El tema sin manifest presenta legacy. No eliminar tablas/historial ni revertir destructivamente las migraciones.

Cambiar el flag del backend no modifica un manifest ya almacenado en Shopify. Archivar una experiencia en DropFlex también requiere publicar para modificar la tienda.
