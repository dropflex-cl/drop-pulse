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

El MCP anuncia `capabilities.extensions["io.modelcontextprotocol/skills"]` y sirve `skills/list`, `skills/get` y `resources/read` sobre una allowlist de cuatro archivos, con SHA-256. Sigue el subconjunto estático de la extensión soportado por OpenAI; no cambia las 56 tools ni concede permisos nuevos. Los recursos conservan la autenticación HTTP existente y no contienen datos privados de productos.

El endpoint de producción es `https://drop-pulse.vercel.app/api/mcp`. Para incorporar la skill al plugin remoto:

1. Desplegar los cambios del MCP y sus archivos trazados.
2. Abrir el registro correspondiente en el portal de plugins y ejecutar **Scan Tools**.
3. Verificar que importa `optimize-product` y todos sus archivos, probarlo y guardar/publicar la versión bajo las políticas del registro.

La importación crea un snapshot en el draft: los clientes no descargan estas skills del MCP automáticamente en cada conversación. Cambiar el servidor exige un nuevo scan para actualizar el plugin distribuido. La instalación local no equivale a publicar una nueva versión remota.

Para empaquetar los archivos:

```sh
python3 scripts/package-dropflex-plugin.py
```

Produce `output/plugins/dropflex-optimizer-1.0.0.zip` sin archivos ajenos. Un registro público con MCP usa el recorrido **With MCP**, no un upload «Skills only» de un paquete con `.app.json`.

## Verificación

```sh
python3 /ruta/a/skill-creator/scripts/quick_validate.py plugins/dropflex-optimizer/skills/optimize-product
npx vitest run lib/product-intelligence/mcp-skills.test.ts lib/product-intelligence/mcp.test.ts lib/product-intelligence/http.test.ts
npm run typecheck
npm run build -- --webpack
```

El validador Python necesita PyYAML. Los tests comprueban descubrimiento, integridad/completitud de recursos, hashes, aislamiento de paths y compatibilidad MCP/HTTP. El build debe incluir los cuatro archivos en el trace de `/api/mcp`.

Prueba conversacional en un producto piloto: iniciar sin selección → elegir/editar hook → proponer PDP → retomar en otro chat → pedir otros hooks → corregir una toma → resolver un conflicto. Verifica que las elecciones se recuperan y que ninguna propuesta se presenta como aprobada o publicada. No reemplaza esta prueba una validación del frontmatter.

Fuentes: [skills y snapshot de importación](https://developers.openai.com/plugins/build/skills), [protocolo de importación MCP](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server), [empaquetado e instalación local](https://developers.openai.com/plugins/build/plugins).
