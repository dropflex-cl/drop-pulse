> Actualización 2026-10-06: las seis migraciones PI ya están aplicadas en producción por autorización explícita posterior. [Registro y verificación](production-migrations-2026-10-06.md). Las afirmaciones de “solo local/readonly” debajo describen las entregas anteriores; no el estado actual de la base. Configuración hosted de OAuth/MCP y actualización del tema conservan sus verificaciones pendientes.

# Landing por ángulo y hook desde MCP

Implementado y verificado localmente. Producción conserva permiso de solo lectura. No se aplicaron migraciones hosted, no se actualizó una tienda ni se consumieron proveedores.

## Contrato compartido

`get_landing_content` y `save_landing_content` reutilizan los 16 componentes del catálogo más `listing`. No crean productos, páginas ni tablas paralelas. Cada `content` admite el objeto anterior o un array de 1 a 12 objetos. La lectura anuncia `contract_version: "1.1"`; guardar acepta `schema_version: "1.0"` y `"1.1"` por compatibilidad. El contrato de cada componente se deriva de su `content.ts` y valida cada variante, incluidos montos, políticas, reseñas y evidencia.

```json
[
  {
    "key": "default",
    "angle_id": null,
    "hook_id": null,
    "content": {
      "title": "Organizador para tu escritorio",
      "short_name": "Organizador",
      "short_description": "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
      "offer_line": "Organiza tu escritorio · Paga al recibir",
      "seo_title": "Organizador para escritorio",
      "seo_description": "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa."
    }
  },
  {
    "key": "comfort",
    "angle_id": "comfort",
    "hook_id": null,
    "content": {
      "title": "Organiza tus útiles con comodidad",
      "short_name": "Organizador",
      "short_description": "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
      "offer_line": "Organiza tu escritorio · Paga al recibir",
      "seo_title": "Organizador para escritorio",
      "seo_description": "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa."
    }
  },
  {
    "key": "comfort_opening",
    "angle_id": "comfort",
    "hook_id": "opening_1",
    "content": {
      "title": "Encuentra tus útiles en el escritorio",
      "short_name": "Organizador",
      "short_description": "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
      "offer_line": "Organiza tu escritorio · Paga al recibir",
      "seo_title": "Organizador para escritorio",
      "seo_description": "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa."
    }
  }
]
```

Este array se envía como `content` de una entrada `component: "listing"`. Para otro componente usa su esquema devuelto por la lectura. En componentes con fotos, `images` es opcional y contiene `{ slot, source: "reference" | "page_image", id }`: IDs existentes del catálogo, nunca URLs ni archivos inventados.

- Una entrada `key: "default"` es obligatoria, con ambos selectores null. Claves y combinaciones de selectores únicas por componente.
- Un hook requiere un ángulo. Selectores: 1–64 caracteres, letras ASCII, números, guion o guion bajo, comenzando por letra o número.
- `angle_id` y `hook_id` son identificadores de ejecución para el enlace. No son nuevas FKs ni prueban pertenencia a una estrategia seleccionada: el chat debe coordinar los mismos identificadores entre componentes y anuncios.
- Omitir un componente al guardar conserva sus variantes existentes; enviar su array sustituye ese contenido completo, no hace merge por `key`.
- Los IDs del `image_catalog` pertenecen al producto y comerciante. La lectura entrega hasta 500 referencias utilizables e imágenes renderizadas no rechazadas; GIFs se conservan como medios compartidos. Picks máximo 30 por variante y límites reales por slot.
- Omitir `images` hereda los picks comunes del componente. Una selección explícita debe cubrir los mínimos de sus slots antes de publicar. Un array vacío en un componente con imágenes obligatorias no permite publicar sin ellas.
- Precios, packs, inventario, reviews y políticas siguen compartidos y calculados/respaldados por el SaaS. Los textos de oferta pueden cambiar; los importes no se recalculan por selector.

## Selección en la tienda

Enlace: `/products/handle?df_angle=comfort&df_hook=opening_1`. Por componente, la prioridad es combinación exacta → ángulo con hook null → default. Componentes sin una combinación concreta conservan su fallback, sin ocultar el resto de la página. `df_hook` solo no selecciona contenido. Parámetros desconocidos, inválidos o repetidos no se usan como texto ni HTML; un hook inválido permite el fallback de ángulo si este es válido.

Los 16 componentes, más título, subtítulo y frase de oferta, renderizan sus variantes como HTML escapado en templates inertes. `df-landing-selector` activa solo una. No hay fetch, escritura ni generación al visitar la tienda. Sin JavaScript se ve default; título/SEO nativos y descripción HTML del producto se publican desde default. La personalización ocurre en navegador: no se promete SEO específico por query string ni una plantilla distinta en Shopify.

El selector soporta carga de secciones del editor y navegación `popstate`. Emite `df:landing-selected` con componente, key y selectores efectivos para integración posterior. No constituye una integración nueva con Meta ni atribución automática de conversiones. Las fuentes editables están en `lib/shopify/components/`; el tema y CSS de preview son copias generadas.

`pain-block` ahora acepta 1–3 momentos del argumento activo; `slot` expresa orden, sin exigir mezclar los tres ángulos en la misma landing. Los objetos históricos de tres momentos siguen válidos.

## Revisión y consistencia

El MCP guarda propuestas; el comerciante revisa, edita y publica. La pantalla Página del producto ofrece “Versión de la página”, muestra parámetros y aplica la misma selección a tarjetas y preview. El editor conserva el array completo y permite editar contenido/fotos por variante. La aprobación es del conjunto: “Guardar y aprobar variantes” no aprueba solo lo visible.

La UI envía ID y `updated_at` de la fila leída. La RPC `pi_review_landing` bloquea el producto y comprueba fila/contexto antes de aprobar o editar. Una pantalla vieja obtiene conflicto, sin sobrescribir otra propuesta. MCP conserva etag, revisión, recibo idempotente, historial y audit de la ingesta. La revisión UI usa los estados/filas existentes; no introduce una segunda revisión PI ni un nuevo historial inmutable de cada edición de UI.

Antes de publicar se revalida cada variante con precio, evidencia y catálogo actuales. Los archivos salen de Storage y se optimizan/suben con el publicador existente. Shopify recibe JSON público y pools `list.file_reference`; los picks privados se sustituyen por `media_indices`. JSON e imágenes de variantes se guardan en un mismo `metafieldsSet` (21 claves como máximo en el catálogo actual; límite de petición 25 y pool 128). [Contrato oficial de atomicidad](https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet).

Esta atomicidad cubre ese lote; producto nativo, datos compartidos, borrados y políticas de tienda siguen siendo pasos separados del publicador. Un fallo se muestra como error y permite reintentar; no se afirma una transacción global entre Supabase y Shopify.

El publicador exige tema DropFlex publicado, versión del kit vigente y checksums remotos de bloques/secciones/renderers/selector. Impide guardar arrays en un tema anterior que los trataría como objetos y mostraría contenido vacío. `ugc-slider` cambia textos por selector; sus videos siguen siendo los existentes/configurados en el tema. El writer de `ugc_videos` desde la app continúa pendiente.

## Despliegue y rollback

1. Aplicar las migraciones PI previas en su orden, incluida etiquetas `20261106000000`, después `20261107000000_landing_variants.sql`. Esta última sustituye funciones y añade la RPC de revisión; no crea tablas, buckets ni assets.
2. Desplegar app/MCP y actualizar el tema con el instalador existente. Revisar una tienda de prueba antes de publicarlo. El código soporta objetos antiguos durante la transición; arrays no se publican con un tema incompatible.
3. Leer contratos/catálogo con `get_landing_content`; escribir desde chat y validar con `dry_run`; guardar con etag/revisión/key actuales.
4. Revisar cada combinación en UI, aprobar el conjunto y publicar desde Publicar. Verificar URL exacta, ángulo, default y checkout en tienda de prueba.

Rollback funcional: mantener migración y código lector compatible, desactivar nuevas escrituras de variantes y volver a guardar/publicar objetos default o arrays solo default con CAS. Confirmar esa republicación antes de instalar un tema viejo. No hacer DROP ni UPDATE destructivo de arrays, receipts, historia o fuentes. Conservar tema anterior para recuperación solo después de que sus metafields sean compatibles. Al borrar el producto siguen operando las cascadas de `page_components`/`copy_runs`/PI y el borrado de Storage existentes: esta entrega no añade archivos persistentes nuevos.

## Verificación y límites

Pruebas puras de fallback, selectores, esquemas de los 16 componentes, montos/reseñas de variantes secundarias, mapping de pools, atomicidad y compatibilidad. Supabase local prueba persistencia, replay, contexto/fila concurrentes, revisión humana, rollback e imágenes de otro producto/dueño.

`scripts/check-landing-variants.mts` renderiza los Liquid reales con LiquidJS y prueba Chromium: 19 bloques × 8 casos de URL × móvil/escritorio, IDs activos únicos, headings, controles, `popstate` y default sin JavaScript. Los filtros exclusivos de Shopify usan adapters ficticios; no sustituye la prueba hosted del checkout/Shopify. LiquidJS se instala fuera del repositorio y se pasa con `PI_LIQUIDJS_ROOT`; no es dependencia del SaaS.

No se probaron Shopify remoto, atribución Meta ni ChatGPT hosted en esta entrega. La próxima salida operacional requiere migración, despliegue y actualización/prueba de tema; producción sigue intacta.

Resultados de cierre: 1.034 tests habituales y 65 transaccionales locales aprobados. Las suites locales se ejecutan con `--no-file-parallelism`; la ejecución conjunta paralela tuvo un INTERNAL_ERROR transitorio en una lectura/revisión de etiquetas, no reproducido en la repetición individual ni secuencial. Typecheck, lint de archivos tocados, contratos, tokens/copias y build webpack aprobados. Theme Check: cero errores y 43 warnings. El build conserva cinco diagnósticos preexistentes de cookies HANGING_PROMISE_REJECTION en ads/onboarding.
