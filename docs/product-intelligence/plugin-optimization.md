# Skill de optimización + plugin DropFlex

La fuente está en `plugins/dropflex-optimizer`. El plugin `dropflex-optimizer` contiene `optimize-product` y reutiliza la conexión registrada de DropFlex mediante `.app.json`; no guarda claves ni reemplaza OAuth. La conexión mapeada es la existente del autor, `asdk_app_6ac9921774708191bc0177abe77337f7`, verificada en la configuración de ChatGPT con el endpoint `https://drop-pulse.vercel.app/api/mcp`. Para otra conexión registrada, actualiza ese mapping con el ID real; no lo inventes ni lo uses como credencial.

## Uso

Invoca la skill como `$optimize-product` en Codex o selecciónala en el plugin del cliente que la tenga instalada. Ejemplos:

- «Optimiza la aspiradora y ayúdame a elegir el hook primario».
- «Dame otros hooks del ángulo elegido».
- «Retoma la optimización de este producto».
- «La foto cambia el mango: corrige esa toma».

El recorrido lee contexto, da opciones de hook y espera elección antes de desarrollar contenido dependiente. Guarda el hook en el ángulo y versiona la selección cuando su snapshot cambie. Retoma propuestas vigentes y conserva trabajo válido. Con autorización explícita de automatización Shopify, la elección de hooks habilita aprobar contenido y usos desde el chat y publicar sin otra confirmación en DropFlex. Sin esa autorización se conserva la revisión manual. Los generadores del cliente y su transferencia de archivos deben validarse en el cliente real; una skill no agrega capacidades de imagen por sí misma.

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

Produce `output/plugins/dropflex-optimizer-1.3.3.zip` sin archivos ajenos. Incluye la skill `optimize-product` 1.3.3, declarada en `metadata.version` de su frontmatter. El servidor MCP toma su versión del manifiesto del plugin; `skills/list`, `skills/get` y el recurso `SKILL.md` permiten verificar por separado la versión de la skill. Estas versiones no certifican qué snapshot está instalado en otro cliente. El paquete con `.app.json` sirve para instalación privada/local; la publicación pública requiere una copia con `mcp.json` y sin referencias App.

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

### Estado y revisión del adjunto (1.0.3)

La tarjeta anterior reemplazaba el mensaje de adjunto exitoso al recibir `openai:set_globals` y no restauraba `widgetState` al montar. Ahora conserva el archivo asociado al mismo producto, referencia y hash; recupera también el estado de 1.0.2. Incluye el fileId real en `modelContent`, además de `imageIds`.

«Revisar referencia en el chat» se ofrece cuando el host admite `sendFollowUpMessage`. Solo al tocarlo se vuelve a publicar el estado con imágenes y se envía una petición de inspección sin generación. No se envían mensajes durante la subida ni en actualizaciones de estado. Subida al host, visión del modelo y entrada del generador siguen siendo etapas distintas; la última necesita prueba real. La respuesta previa al toque no se actualiza retroactivamente. Véase [bridge oficial y persistencia](https://developers.openai.com/plugins/reference#windowopenai-component-bridge).

```sh
python3 /ruta/a/skill-creator/scripts/quick_validate.py plugins/dropflex-optimizer/skills/optimize-product
npx vitest run lib/product-intelligence/mcp-skills.test.ts lib/product-intelligence/mcp.test.ts lib/product-intelligence/http.test.ts
npm run typecheck
npm run build -- --webpack
```

El validador Python necesita PyYAML. Los tests comprueban descubrimiento, integridad/completitud de recursos, hashes, aislamiento de paths y compatibilidad MCP/HTTP. El build debe incluir los cuatro archivos en el trace de `/api/mcp`.

Prueba conversacional en un producto piloto: iniciar sin selección → elegir/editar hook → proponer PDP → retomar en otro chat → pedir otros hooks → corregir una toma → resolver un conflicto. Verifica que las elecciones se recuperan y que ninguna propuesta se presenta como aprobada o publicada. No reemplaza esta prueba una validación del frontmatter.

Fuentes: [skills y snapshot de importación](https://developers.openai.com/plugins/build/skills), [protocolo de importación MCP](https://developers.openai.com/plugins/build/mcp-server#import-skills-from-the-mcp-server), [empaquetado e instalación local](https://developers.openai.com/plugins/build/plugins).

## Automatización Shopify (1.1.0)

Pedido previsto: «Yo elijo los hooks; después aprueba la página y las imágenes y publica automáticamente en Shopify». El comerciante sigue decidiendo esos hooks en el chat. Esto no autoriza campañas en Meta ni convierte hipótesis en hechos verificados.

`authorize_shopify_automation` exige los textos exactos de los hooks de la estrategia activa, revisión vigente, permiso read/write y autorización explícita. Guarda consentimiento por producto y actor real; activa la planificación PDP del producto. La estrategia se comprueba contra sus dependencias actuales. `get_shopify_automation` recupera consentimiento, faltantes, huella y estado de publicación; `disable_shopify_automation` detiene decisiones futuras sin despublicar.

Los saves de identidad y planes exclusivos de PDP/galería se aprueban bajo esa autorización. `review_visual_record` permite al chat aprobar/rechazar assets y seleccionar usos de Shopify después de inspeccionarlos. Los saves de etiquetas y copy nativo quedan aprobados y habilitados. El plan persuasivo admite `approved` y la experiencia `active`; siguen los validadores de cobertura, evidencia, variantes y campos protegidos. Aprobar nombres de packs no invalida por sí solo el hook: para este modo, la estrategia contrasta las demás dependencias contra su revisión original. La revisión manual conserva sus reglas anteriores.

`publish_product` usa la huella MD5 del writer Shopify existente (identificador del contenido, no credencial), la revisión y una clave idempotente. Valida conexión, imágenes, packs, componentes, experiencias y tema antes de encolar. Solo hay un trabajo vivo por producto. El worker revalida grant/sesión reales, autorización, tienda y contenido antes de las escrituras; una conexión revocada no se sustituye por una identidad merchant. Repetir exactamente una llamada recupera el mismo trabajo y permite retomar un lease vencido. Un trabajo con error confirmado necesita una clave nueva y una lectura actual; no una nueva confirmación humana si el permiso sigue activo. Un proceso interrumpido no se declara publicado. Las mutaciones Shopify no son una transacción única: un fallo intermedio puede dejar parte actualizada y exige reintentar la misma versión vigente.

Cambiar estrategia, hook, catálogo, precio, mercado, referencias o evidencia invalida el consentimiento. No se autoaprueban reseñas ni hechos. Las tablas nuevas tienen borrado en cascada hacia el producto y no crean archivos fuera de los buckets existentes; la optimización de bytes conserva el flujo de Storage actual. Los helpers/RPCs son service_role, con RLS y sin cambios en auth/OAuth.

### Despliegue y móvil

1. Aplicar `supabase/migrations/20261203000000_shopify_chat_automation.sql` en la base del entorno elegido. Desplegar el backend junto con los cuatro archivos de la skill.
2. Mantener `PDP_PERSUASION_ENABLED=true` y producción visual habilitada. El consentimiento activa el flag por producto; no hace falta ir al SaaS a activarlo.
3. Actualizar el plugin remoto con **Scan Tools**, importar la skill 1.1.0 y publicar/guardar esa versión. Confirmar descubrimiento de `get_shopify_automation`, `authorize_shopify_automation`, `disable_shopify_automation`, `review_visual_record` y `publish_product`.
4. Refrescar la conexión del cliente y abrir un chat nuevo. Probar en un producto piloto: elegir hook → identidad/plan → imagen/selección → copy/packs → experiencia activa → Shopify publicado con URL real. Probar también hook cambiado, revocación, llamada ambigua y permiso desactivado.

La actualización local no modifica el plugin remoto de ChatGPT. El host debe permitir las tools, la entrega de la referencia al generador y la transferencia del resultado. Este cambio quita las aprobaciones adicionales de DropFlex; no habilita una tool desactivada por ChatGPT ni elimina diálogos del host. La imagen externa no puede sustituirse por un SKU aproximado para fingir automatización.

Validación local: tests unitarios y con OAuth real/Supabase local, sin generar con proveedores ni publicar en una tienda real; contratos exportados, typecheck, lint de archivos afectados, validación de skill y build webpack. El lint global conserva errores preexistentes del tema Shopify incluido. El build termina con avisos preexistentes de prerender/cookies en onboarding y ads. La prueba móvil con publicación real sigue pendiente del rollout remoto.

## Transporte y reanudación (1.2.0)

Esta versión reemplaza la interacción de las tarjetas 1.0.2/1.0.3. El recurso `ui://dropflex/visual-reference/v2.html` presenta «Usar referencia y continuar». Un toque renueva el enlace temporal de la misma referencia, verifica ID/hash/bytes, sube el archivo real al host y solicita continuar el último pedido en otro turno. Conserva el límite «no generar» y las aprobaciones del usuario. Reintentar un mensaje fallido reutiliza el archivo; recibir otro producto o referencia mientras sube detiene la continuación. Los resultados de telemetría no reemplazan el contexto de la tarjeta.

`ingest_chatgpt_visual_asset` anuncia el parámetro nativo `file` mediante `_meta["openai/fileParams"]: ["file"]`. ChatGPT debe entregar `download_url` y `file_id` reales. El servidor descarga, valida, optimiza y conserva el resultado mediante la ingestión durable existente. URL HTTPS y ticket firmado siguen disponibles. Un ID interno aislado o `sandbox:/…` no es un archivo transferible. La confirmación sigue siendo `get_visual_ingestion_status` con `succeeded` y asset real.

El plan incluye `readiness` y razones concretas. La aprobación de identidad reencadena los planes de su propuesta sin adoptar cambios físicos. Una propuesta previa puede pasar a aprobación automática con una nueva versión. El chat reconcilia identidades/estrategias distintas antes de preparar una toma. `get_visual_transfer_history` consulta fallos por etapa; los eventos del widget son declaraciones del cliente y no prueban que el generador haya recibido la foto.

Despliegue: aplicar `20261204000000_visual_approval_version_chain.sql` y `20261205000000_visual_transfer_events.sql`, desplegar código/skill, actualizar el catálogo y snapshot del plugin remoto, refrescar conexión y abrir un chat nuevo. Comprobar descubrimiento de `ingest_chatgpt_visual_asset` y `get_visual_transfer_history`; `record_visual_transfer_event` está disponible solo para la tarjeta. La instalación local y un zip no actualizan el registro remoto por sí solos.

Validación: suite general, Supabase local con storage/worker reales y descarga de archivo externo simulada, aprobación automática con OAuth local, contratos, skill, typecheck, lint de archivos modificados y build webpack. La tarjeta se verificó a 390 px en claro/oscuro, sin desbordamiento y con botón de 44 px. Las migraciones se aplicaron únicamente en local. Falta la aceptación con el host de ChatGPT móvil real después de desplegar: referencia adjunta → entrada real al generador → resultado transferido → asset visible en DropFlex.

Contrato de archivos: [referencia oficial de plugins](https://developers.openai.com/plugins/reference); adjuntos en turnos posteriores: [estado e imágenes en ChatGPT](https://developers.openai.com/plugins/build/chatgpt-ui).

## Continuación de referencia · plugin y skill 1.3.2

Caso observado en ChatGPT móvil: después de «Continuar con la referencia», el chat recuperaba otra tarjeta y volvía a pedir el mismo clic. La tarjeta reutiliza ahora el archivo verificado para el mismo producto/ID/hash sin renovar ni descargar otra vez, y persiste `followup_pending`/`followup_sent` para impedir envíos duplicados al remontar. Un timeout queda `followup_unknown`: no demuestra rechazo del host y requiere continuar manualmente en el chat, sin reenviar desde la tarjeta. Un rechazo confirmado permite reintentar solo el mensaje. La UI se sirve desde `ui://dropflex/visual-reference/v3.html`.

La skill, las instrucciones del servidor y las acciones del contexto reutilizan el adjunto vigente; preparar otra iteración no obliga a adjuntar otra vez. Si el modelo no puede inspeccionar los píxeles o el generador no puede recibir el archivo, se pide la subida manual una sola vez y se detiene esa toma, sin repetir la tarjeta. Subir al host sigue sin demostrar recepción por el modelo o por el generador; esta capacidad requiere verificación en el cliente móvil.

## Referencia pendiente · plugin y skill 1.3.3

Caso observado: el chat seguía verificando la referencia mientras el botón aún esperaba el clic; en un mensaje posterior sí podía ver el archivo. Al mostrar la tarjeta en ChatGPT sin adjunto, la skill y las instrucciones MCP cierran el turno con «Pulsa Usar referencia y continuar para seguir». No se ejecutan más herramientas ni se declara un fallo de acceso antes del clic. La continuación del botón comparte el archivo en otro turno y retoma el pedido original con sus límites y permisos, sin exigir que se repita. Un archivo recibido que realmente siga inaccesible conserva el diagnóstico y el fallback existentes. Los clientes que ya reciben una imagen utilizable directamente no necesitan esa pausa.

La separación de turnos es una instrucción al agente, no un bloqueo impuesto por DropFlex al runtime de ChatGPT. Las pruebas locales comprueban transporte y orden de subida/continuación; falta verificar en ChatGPT móvil la inspección posterior y la entrada real al generador.

La continuación actual se sirve desde `ui://dropflex/visual-reference/v4.html` para evitar conservar el mensaje de una tarjeta anterior. Actualiza las herramientas de la conexión después del despliegue del MCP y prueba en un chat nuevo con la skill 1.3.3.
