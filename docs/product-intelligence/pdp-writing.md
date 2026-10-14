# Dirección editorial de PDP · 1.7.23

La página desarrolla una transformación central desde el hook elegido. La ficha resume producto, cambio deseado y oferta; el cuerpo desarrolla reconocimiento, consecuencia cotidiana, explicación, demostración, facilidad, objeciones y cierre. Un componente puede retomar el beneficio desde otra escena o explicación: se evita duplicar párrafos, no reforzar la venta.

La POC acordada usa el tónico de la referencia de Abejita Store. El control fue una reconstrucción editorial de ejemplos anteriores, no una ejecución independiente ni una prueba de conversión. La fixture reproducible está en `lib/product-intelligence/fixtures/pdp-writing.json`; no guarda esos datos ni testimonios en productos reales.

## Fuentes alineadas

- `plugins/dropflex-optimizer/skills/optimize-product/references/pdp-writing.md`: núcleo editorial completo, revisión del recorrido, roles y mensajes visuales.
- `SKILL.md` y `production.md`: carga de la nueva referencia, refuerzo intencional, bajada comercial y escenas según función. Se conservan hooks elegidos, transferencias, UGC, conservación de contenido y permisos de publicación.
- `_shared/pdp-writing.ts`: orientación compartida por contexto y servidor MCP, sin propiedades nuevas de datos.
- `component-generation.ts`, `mcp.ts` y `visual-schemas.ts`: contexto, inicio de sesión y descripción de discovery. `benefit-usps` vuelve a describir sus políticas reales; los beneficios del producto permanecen en `gallery_benefits`.
- Diez componentes canónicos reciben reglas y ejemplos concretos; `pain-block`, `image-with-benefits` y `listing` refuerzan continuidad. Los ejemplos son ilustraciones, no datos transferibles de otros productos.
- `mcp-skills.ts` permite descubrir y leer la referencia nueva con su digest; los manifiestos y la skill de optimización pasan a `1.7.23`.

## Contratos y paridad

No cambian campos, obligatoriedad, límites, variantes, image slots, formatos, writers, orden guardado ni fuentes de precio/políticas. No se requieren migraciones ni una actualización del tema instalado. La regeneración canónica confirma que Liquid, previews y kit permanecen iguales.

La prueba `pdp-writing.local.test.ts` recorre contratos descubiertos por MCP → contenido de la POC → guardado real local → `preparePublish` y contenido efectivo → previews React → metafields del payload. Usa precio y envío guardados en la fixture, sin generación ni publicación. Las pruebas vigentes conservan decisiones de medios, variantes, ocultos y descartes.

## Verificación de implementación

- 415 pruebas de contratos, contexto, protocolo, importación de skills, componentes, previews y payload aprobadas.
- 11 pruebas de integración con Supabase local aprobadas, incluido el recorrido de la POC.
- Contratos exportados: 70 pares; validación de schemas y límites correcta.
- Compilación con webpack correcta; TypeScript y lint se comprueban antes del commit.
- JSON/YAML del paquete y versiones de skill/manifiestos validados. Paquete fuente de 15 archivos.
- Theme Check: 460 archivos, sin errores; 42 advertencias previas.

La prueba de proyecciones históricas `read-projections.local.test.ts` conserva un fallo `source_equal` reproducido en el commit anterior `de1940c` con la misma base local. No se cambia su SQL ni sus assertions en esta modificación editorial.

La evidencia de distribución debe registrar por separado commit en main/origin, despliegue, release del plugin, catálogo anunciado/importado y una conversación nueva. El paquete local por sí solo no acredita que la conexión use la nueva orientación.
