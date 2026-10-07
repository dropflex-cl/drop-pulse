# Skill de optimización + plugin DropFlex

La fuente está en `plugins/dropflex-optimizer`. El plugin `dropflex-optimizer` contiene `optimize-product` y reutiliza la conexión registrada de DropFlex mediante `.app.json`; no guarda claves ni reemplaza OAuth. La conexión mapeada es la existente del autor, `asdk_app_6ac663c8e5788191934c95ef134cb863`. Para otra conexión registrada, actualiza ese mapping con el ID real; no lo inventes ni lo uses como credencial.

## Uso

Invoca la skill como `$optimize-product` en Codex o selecciónala en el plugin del cliente que la tenga instalada. Ejemplos:

- «Optimiza la aspiradora y ayúdame a elegir el hook primario».
- «Dame otros hooks del ángulo elegido».
- «Retoma la optimización de este producto».
- «La foto cambia el mango: corrige esa toma».

El recorrido lee contexto, da opciones de hook y espera elección antes de desarrollar contenido dependiente. Guarda el hook en el ángulo y versiona la selección cuando su snapshot cambie. Retoma propuestas vigentes y conserva trabajo válido. Las aprobaciones y selección de usos siguen en DropFlex. Los generadores del cliente y su transferencia de archivos deben validarse en el cliente real; una skill no agrega capacidades de imagen por sí misma.

## Instalación local

El marketplace del repo vive en `.agents/plugins/marketplace.json`, con raíz en el repositorio y `source.path: "./plugins/dropflex-optimizer"`. Registrar e instalar:

```sh
codex plugin marketplace add /ruta/al/drop-pulse
codex plugin add dropflex-optimizer@dropflex-local
codex plugin list --marketplace dropflex-local --json
```

El paquete local se presenta como «DropFlex · Optimización», junto a la conexión DropFlex existente; no modifica el plugin remoto publicado. Reinicia el cliente o abre una sesión nueva para cargar la skill. Una conversación ya iniciada no recibe retroactivamente nuevas skills. Las actualizaciones locales se recargan al refrescar/reiniciar según el cliente.

Instalado y habilitado el 2026-10-07 como `dropflex-optimizer@dropflex-local`, versión 1.0.0. El CLI confirmó el paquete completo en la caché del cliente. Pasan validación de skill, typecheck, lint y pruebas MCP/HTTP; el build incluye los cuatro recursos en el trace de la función. Conserva los avisos preexistentes de prerender de onboarding/ads.

## Importación para el plugin distribuido

El MCP anuncia `capabilities.extensions["io.modelcontextprotocol/skills"]` y sirve `skills/list`, `skills/get` y `resources/read` sobre una allowlist de cuatro archivos, con SHA-256. Sigue el subconjunto estático de la extensión soportado por OpenAI. Los recursos conservan la autenticación HTTP existente y no contienen datos privados de productos.

El endpoint de producción es `https://drop-pulse.vercel.app/api/mcp`. Para incorporar la skill al plugin remoto:

1. Desplegar los cambios del MCP y sus archivos trazados.
2. Abrir el registro correspondiente en el portal de plugins y ejecutar **Scan Tools**.
3. Verificar que importa `optimize-product` y todos sus archivos, probarlo y guardar/publicar la versión bajo las políticas del registro.

La importación crea un snapshot en el draft: los clientes no descargan estas skills del MCP automáticamente en cada conversación. Cambiar el servidor exige un nuevo scan para actualizar el plugin distribuido. La instalación local no equivale a publicar una nueva versión remota.

Para empaquetar los archivos:

```sh
python3 scripts/package-dropflex-plugin.py
```

Produce `output/plugins/dropflex-optimizer-1.0.2.zip` sin archivos ajenos. Un registro público con MCP usa el recorrido **With MCP**, no un upload «Skills only» de un paquete con `.app.json`.

## Referencia visual obligatoria (1.0.1)

La incidencia del 2026-10-07 mostró un SKU blanco generado en ChatGPT mientras la base guardada era negra/violeta. En producción el producto no tenía registros Visual Production, y el catálogo conectado en la sesión de diagnóstico conservaba 37 tools sin las visuales. Esto confirma que el flujo persistido no se había ejecutado; no permite inspeccionar los argumentos privados del generador de otro chat.

`get_visual_reference_image` entrega un bloque de imagen MCP desde los mismos bytes autorizados que se hashean en la lectura. Exige ID y hash canónicos, verifica la iteración cuando se proporciona y rechaza una referencia cambiada. Los bytes no se duplican en structuredContent. Si hace falta, devuelve una preview WebP sin recorte, EXIF aplicado y transparencia conservada; el original sigue disponible en su URL temporal. Diferencia hash original y hash de la preview. La respuesta completa, incluido base64, respeta el límite MCP.

El skill exige ver la foto y adjuntarla como entrada real del generador. Si el cliente no permite ese paso, pide adjuntar la original y detiene la toma. MCP image hace visible la referencia, pero no certifica que un generador externo la recibió ni garantiza fidelidad: debe comprobarse en el cliente real y revisarse el resultado.

Después de desplegar, vuelve a escanear tools y skill en el portal, comprueba que incluye `get_visual_reference_image` y publica/guarda la versión actualizada. Reconecta el cliente y abre un chat nuevo. Desplegar Vercel no actualiza por sí solo el catálogo del plugin ni el snapshot de la skill. No se necesita una migración nueva.

Validación de 1.0.1: 51 pruebas de dominio/media/MCP/HTTP/skill y ocho de Supabase local; typecheck, lint de archivos afectados, contratos, frontmatter y build. El original de la aspiradora se probó con el mismo codificador y cabe completo a 1200 × 1200, sin reducción. Instalado localmente mediante el CLI como versión 1.0.1; esto no actualiza el plugin remoto de ChatGPT.

## Verificación

### Archivo de referencia en ChatGPT (1.0.2)

La prueba móvil posterior encontró la tool, pero siguió mostrando solo un enlace. Un bloque MCP `image` no garantiza un adjunto nativo ni su entrega al generador.

La tool ahora declara el recurso `ui://dropflex/visual-reference/v1.html`, servido mediante `resources/read` autenticado. La tarjeta muestra la foto original. Al tocar «Adjuntar referencia al chat», descarga los bytes originales sin credenciales del navegador, verifica SHA-256 y crea un `File`; `window.openai.uploadFile` devuelve el identificador real de ChatGPT y `setWidgetState` lo comparte en `imageIds` para turnos posteriores. No se inventan IDs ni se invoca generación. Si el host no expone las APIs, muestra el fallback de adjuntar manualmente. CSP limita imágenes y descargas al storage configurado y al CDN de Shopify.

Este paso sigue las [APIs oficiales de archivos](https://developers.openai.com/plugins/reference#file-apis) y el [estado con imágenes](https://developers.openai.com/plugins/build/chatgpt-ui#make-images-visible-to-the-model). Las pruebas verifican transporte MCP, archivo exacto, rechazo de hash distinto y ausencia de subida automática. La compatibilidad móvil y la entrega efectiva al generador requieren la prueba del cliente real; no se presentan como comprobadas.

Después del deploy, refresca la conexión MCP para cargar la metadata UI actualizada y abre un chat nuevo. Para una skill importada, actualiza además su snapshot por el mecanismo de publicación del plugin. No requiere migraciones.

```sh
python3 /ruta/a/skill-creator/scripts/quick_validate.py plugins/dropflex-optimizer/skills/optimize-product
npx vitest run lib/product-intelligence/mcp-skills.test.ts lib/product-intelligence/mcp.test.ts lib/product-intelligence/http.test.ts
npm run typecheck
npm run build -- --webpack
```

El validador Python necesita PyYAML. Los tests comprueban descubrimiento, integridad/completitud de recursos, hashes, aislamiento de paths y compatibilidad MCP/HTTP. El build debe incluir los cuatro archivos en el trace de `/api/mcp`.

Prueba conversacional en un producto piloto: iniciar sin selección → elegir/editar hook → proponer PDP → retomar en otro chat → pedir otros hooks → corregir una toma → resolver un conflicto. Verifica que las elecciones se recuperan y que ninguna propuesta se presenta como aprobada o publicada. No reemplaza esta prueba una validación del frontmatter.

Fuentes: [skills y snapshot de importación](https://developers.openai.com/plugins/build/skills), [protocolo de importación MCP](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server), [empaquetado e instalación local](https://developers.openai.com/plugins/build/plugins).
