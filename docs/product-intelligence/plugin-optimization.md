# Skill de optimización + plugin DropFlex

La fuente está en `plugins/dropflex-optimizer`. El plugin `dropflex-optimizer` contiene `optimize-product` y reutiliza la conexión registrada de DropFlex mediante `.app.json`; no guarda claves ni reemplaza OAuth. La conexión mapeada es la existente del autor, `asdk_app_6ac9921774708191bc0177abe77337f7`, verificada en la configuración de ChatGPT con el endpoint `https://drop-pulse.vercel.app/api/mcp`. Para otra conexión registrada, actualiza ese mapping con el ID real; no lo inventes ni lo uses como credencial.

## Escritura UGC y continuidad argumental · 1.7.6

Caso observado: una propuesta abría con el hook elegido sobre apariencia de cansancio, pero su desarrollo cambiaba a una rutina incompleta y autocuidado genérico. Dos líneas tampoco cabían en el tiempo asignado. La skill ahora recupera `get_product_strategy` con `include: "execution"` y el contrato UGC, establece situación de compra → motivación → beneficio → explicación o demostración → objeción → oferta, y comprueba que cada escena avance esa misma razón de compra. La cadena es trabajo editorial, no seis escenas obligatorias ni otra aprobación del comerciante.

La nueva referencia `references/ugc-writing.md` distingue variantes de apertura de cambios de motivación, exige conectar características y demostración con el beneficio, y revisa palabras/segundo por toma antes de mostrar una propuesta. Conserva los límites de las instrucciones del usuario: «no guardes» permite lecturas y respuesta en el chat, sin writers ni dry runs. No solicita clips, publicaciones ni otra IA para la revisión editorial.

La prueba conversacional de 1.7.4 confirmó lecturas y carga, pero entregó una propuesta genérica con conteos incorrectos. La revisión 1.7.5 lleva el control a la skill principal: recuperar producto y oferta, reescribir debilidades antes de entregar, mostrar palabras y ritmo de cada línea, y comprobar la tensión completa de la apertura sin esquivar su límite con puntuación. No exige seis escenas ni deja la explicación o el pack como mejoras para después.

La prueba de 1.7.5 ya leyó producto y oferta y mostró una tabla, pero afirmó 84 palabras donde el contador canónico da 79. La tool de lectura `validate_ugc_script_timing` en 1.7.6 comprueba el texto exacto y la apertura completa, usando los límites y contadores vigentes. Devuelve conteos, ritmo por toma, suma, problemas por campo y alcance `timing_only`. No guarda la propuesta, no necesita plan de producción ni permiso de escritura, no llama a proveedores y no certifica persuasión ni duración real del montaje. La skill debe corregir y volver a comprobar antes de entregar, usando los números devueltos. «No guardes» permite esta lectura y sigue prohibiendo writers, incluso con `dry_run`.

Se sincronizan ambos manifiestos y la skill en 1.7.6. La allowlist de recursos MCP incluye la nueva referencia; se exportan input/output de la nueva lectura y se conserva el scope de lectura existente. No cambian contratos de Shopify ni migraciones. Producción ejecuta `80f0524`; el readback del plugin confirma el release `pluginrel_6acc63c0379481918d999949d1508485` y los doce archivos. Tras Refresh tools, el catálogo importado muestra `validate_ugc_script_timing` con su descripción de solo lectura. Un chat nuevo cargó 1.7.6 e invocó la tool; sus cinco líneas suman 55 palabras en 31 segundos, con conteos coincidentes con el contador canónico y cero problemas temporales. Se verificaron 47 pruebas, tipos, lint, contratos y build. [Evidencia de distribución y prueba](plugin-release-1.7.6.json).

El ensayo conserva la dirección descanso/apariencia y enlaza cuidado específico, aplicación y pack vigente. La fuerza de su objeción de aplicación sigue siendo una evaluación editorial: la comprobación `timing_only` no acredita persuasión. Tampoco se consultó `tools/list` por HTTP OAuth independiente; la evidencia productiva es el refresco del catálogo y la invocación desde el cliente. Los tiempos son previstos, sin clips generados ni montaje.

## Versión publicada · 1.7.0

El plugin privado [DropFlex · Optimización](https://chatgpt.com/plugins/Plugin_e3bca2a0f2208191a04ed05f2b5904fa) se actualizó a 1.7.0, release `pluginrel_6acc365595cc8191b6f295eb554819c1`. El push a `main` había actualizado la fuente, pero el registro del plugin seguía en 1.6.4. La actualización remota y su lectura posterior verificaron los once archivos: cambiaron ambos manifiestos, la skill y su referencia de producción; los otros siete, la conexión, identidad, presentación y audiencia permanecen iguales. [Evidencia del release](plugin-release-1.7.0.json).

La versión añade `get_component_generation_context` y `get_pdp_completion_report`, argumentos propios por componente desde el hook elegido y asignación de imágenes por variante, slot y posición. Se aplicaron las migraciones `20261217000000` y `20261218000000` en el proyecto vinculado `oukcswnfrzroxgwqmujf`, con respaldo previo del esquema. La simulación posterior confirmó cero migraciones pendientes. Una lectura del MCP activo devolvió 35 destinos `landing_component` y 7 de galería, conservando la revisión del contenido del producto. Esta verificación no generó imágenes ni publicó productos de comerciantes.

Una instalación o conversación abierta puede mantener el snapshot anterior. Actualiza el plugin y el catálogo de la conexión y abre un chat nuevo; el readback remoto confirma el release publicado, no la recarga del cliente. Las secciones siguientes conservan el historial de versiones anteriores.

## Motivaciones de compra y evaluación de hooks · 1.6.2

La skill diagnostica situaciones concretas de compra antes de redactar: experiencia, dolor o deseo, alternativa actual y resultado buscado. No define al comprador solo por querer usar la categoría ni espera que el comerciante le recuerde investigar el dolor. Sin investigación de clientes, desarrolla hipótesis explícitas sin inventar frecuencia, validación o expresiones observadas.

Los ángulos representan razones de compra diferenciadas. Un producto protagonista o bundle no fija un único dolor; ingredientes y condiciones comerciales necesitan una motivación que justifique su protagonismo. La preocupación del comprador se evalúa por separado de la promesa sostenible del producto. Antes de mostrar propuestas, la skill revisa identificación, motivo para seguir, tensión o curiosidad, claridad del formato y conexión con la oferta. Añadir mayúsculas o una orden de atención no sustituye ese trabajo. La recomendación es una hipótesis comercial, no un ganador medido.

El feedback que cuestiona dolor, motivación, persuasión o scroll permite revisar diagnóstico y ángulo. Pedir nuevas entradas del mismo argumento conserva la dirección. Se mantiene la elección explícita del comerciante, el contenido vigente y la autorización independiente para publicar; no se agregan aprobaciones ni generaciones pagadas a la revisión editorial.

Actualización privada confirmada en el plugin existente, versión 1.6.2 y release `pluginrel_6acc1b358be48191a2b6be5ac2450a3c`. El readback verifica los once archivos contra el paquete publicado: cambian ambos manifiestos, la skill y su referencia de hooks; los otros siete archivos permanecen exactos, incluida la conexión y el ebook. La presentación, los prompts del plugin, su identidad y el ámbito personal privado se conservan. [Evidencia del release](plugin-release-1.6.2.json).

Validación: validador de skill, 31 pruebas MCP/HTTP/entrega de skills, integridad del paquete completo y overlay de cuatro archivos. No se realizó un ensayo conversacional de ChatGPT; estas verificaciones comprueban distribución y contratos. Las ediciones simultáneas ajenas al cambio se conservan fuera de este commit y del paquete publicado. Un chat abierto puede conservar el snapshot anterior; refresca el plugin y abre una conversación nueva para cargar la versión vigente.

## Flujo vigente y adaptación 1.6.1

Esta sección y [contenido vigente](current-content.md) prevalecen sobre los registros históricos de este documento. La versión 1.6.0 publicada tenía instrucciones de aprobación, reconciliación y snapshots que ya no correspondían al servidor. Parte de los archivos del repositorio había cambiado sin una nueva publicación; desplegar el servidor no actualizó el snapshot distribuido del plugin.

La skill 1.6.1 aplica estas reglas:

- Guardar deja el contenido válido disponible; elegir, asignar, ordenar, ocultar y descartar son decisiones explícitas. Publicar requiere su autorización Shopify propia.
- UI y MCP editan la misma fila vigente; cambiar contexto, hooks, estrategia, precios o políticas conserva contenido, imágenes omitidas, usos, descartes, orden y secciones ocultas. No genera ni gasta créditos.
- Plan persuasivo y experiencia no son etapas obligatorias para editar un componente o reutilizar un archivo. Una generación nueva necesita su pedido y requisitos reales.
- `bind_visual_asset` guarda el uso indicado sin llamadas posteriores de aprobación o selección. `review_visual_record` y reconciliación permanecen como decisiones explícitas/compatibilidad, no como pasos del recorrido.
- Revisión, etag, stamps e idempotencia se resuelven en el servidor; el cliente puede conservar una clave para reintentos ambiguos. Un conflicto requiere releer, respetando ediciones concurrentes.
- La autorización Shopify activa se conserva al editar; una desactivada no se reactiva. Elegir un hook no autoriza por sí solo publicar, generar clips de pago o lanzar campañas Meta.
- UGC conserva guiones y medios; keyframes externos crean destinos faltantes y el montaje se realiza localmente con Python/FFmpeg: clips hablados y de apoyo, voz original, sin captions ni capas añadidas. La skill de CapCut está deprecada. La referencia real, su transferencia al generador, la autenticidad de hechos/reseñas y los requisitos de archivos, destinos y permisos siguen vigentes.

Se conserva íntegra la conexión y presentación del plugin asociado a la App, incluidos los prompts de entrada existentes. La skill define cómo interpretar el texto heredado «aprueba automáticamente» sin introducir aprobaciones. Su propio `agents/openai.yaml` pide guardar, asignar y publicar con autorización explícita. El manifiesto raíz y el overlay `.codex-plugin/plugin.json` comparten versión 1.6.1 e identidad; el empaquetador conserva el overlay y rechaza versiones distintas. `create-gift-ebook` 3.0.0 y sus archivos permanecen intactos; la optimización remite a su paleta desde la referencia real en lugar de imponer el acento de la PDP.

Las pruebas de `mcp-skills.test.ts` ejercen los recursos servidos por el transporte MCP y detectan instrucciones que reintroducen aprobaciones, reconciliación obligatoria, invalidaciones, versiones comerciales, requisitos técnicos o el worker Remotion. También comprueban integridad de archivos/hashes y compatibilidad de manifiestos. Son comprobaciones deterministas de las instrucciones; no equivalen a una evaluación conversacional del modelo en ChatGPT.

La actualización privada se guardó con Plugin Creator sobre el ID existente `Plugin_e3bca2a0f2208191a04ed05f2b5904fa`, usando el release anterior como control de concurrencia. El readback confirmó versión 1.6.1 y release `pluginrel_6acb9a62a038819180b2f09574a4218c`, los mismos once archivos, los cuatro archivos de optimización exactamente iguales al candidato y los cuatro de ebook y `.app.json` intactos. El manifiesto compatible se normalizó con escapes Unicode, conservando el mismo JSON. No cambió el scope personal ni la visibilidad privada.

Verificación: 40 pruebas MCP/HTTP/skill/decisiones y 17 de integración local de contenido vigente/Shopify; TypeScript, lint del test modificado, 65 contratos sin diff y build Webpack correctos. El empaquetado incluye el overlay y una prueba negativa rechazó versiones distintas. La primera ejecución TypeScript coincidió con la regeneración de `.next` del build y falló por archivos transitorios ausentes; pasó al repetirla después del build. No hubo migraciones, generaciones pagadas, campañas ni publicaciones de productos. [Evidencia de release y readback](plugin-release-1.6.1.json).

Una conversación abierta puede conservar la skill 1.6.0; refresca la instalación/conexión y abre un chat nuevo para cargar el release vigente. Guardar esta actualización no acredita un ensayo conversacional de ChatGPT ni el estado final de Vercel.

## Uso

Invoca la skill como `$optimize-product` en Codex o selecciónala en el plugin del cliente que la tenga instalada. Ejemplos:

- «Optimiza la aspiradora y ayúdame a elegir el hook primario».
- «Dame otros hooks del ángulo elegido».
- «Retoma la optimización de este producto».
- «La foto cambia el mango: corrige esa toma».

El recorrido lee contexto, da opciones de hook y espera elección antes de desarrollar contenido dependiente. Guarda el hook en el ángulo y actualiza la estrategia vigente sin crear una versión de negocio. Retoma propuestas vigentes y conserva trabajo válido. Con autorización explícita de automatización Shopify, la elección de hooks permite completar contenido y publicar sin otra confirmación en DropFlex. Guardar deja contenido disponible aunque no exista autorización para publicar; seleccionar imágenes y ocultar secciones son decisiones explícitas. Los generadores del cliente y su transferencia de archivos deben validarse en el cliente real; una skill no agrega capacidades de imagen por sí misma.

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

Produce `output/plugins/dropflex-optimizer-1.6.2.zip` sin archivos ajenos. Incluye la skill `optimize-product` 1.6.2, declarada en `metadata.version` de su frontmatter, y conserva `create-gift-ebook` 3.0.0. El servidor MCP toma su versión del manifiesto del plugin; `skills/list`, `skills/get` y el recurso `SKILL.md` permiten verificar por separado la versión de la skill. Estas versiones no certifican qué snapshot está instalado en otro cliente. El paquete con `.app.json` sirve para instalación privada/local; la publicación pública requiere una copia con `mcp.json` y sin referencias App.

## Registro histórico: referencia visual obligatoria (1.0.1)

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

## Registro histórico: automatización Shopify (1.1.0)

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

## Galería comercial con texto integrado · plugin y skill 1.3.4

Caso observado en ChatGPT móvil: «genera la galería» produjo fotos casi iguales del producto, sin texto. Pedir después imágenes informativas con texto produjo la dirección comercial deseada. Ahora esa dirección es el valor por defecto: producto protagonista, titulares dominantes, mensajes breves y composiciones variadas legibles en móvil. Cada pieza aporta un argumento de la estrategia, con la oferta y condiciones reales de pago contra entrega; un pedido explícito de fotos sin texto conserva su prioridad.

La skill exige concretar el copy en `message.overlay_text`, la jerarquía y ubicación en la composición, y la tipografía en el sistema visual. La instrucción de la iteración y la llamada al generador reciben esa misma dirección. La revisión incluye texto integrado correcto y legible y variedad informativa y visual, además de identidad. Una pieza de estilo nunca sustituye la foto canónica ni verifica sus claims. Las instrucciones de inicialización MCP comparten el mismo criterio.

El paquete 1.3.4 y la fuente del MCP requieren actualizar el snapshot del plugin remoto y desplegar el servidor, respectivamente. Una caché instalada o una conversación abierta no cambian al editar estos archivos. La validación local de importación y empaquetado no demuestra la calidad de una generación real; falta verificar el primer lote en el cliente que cargue esta versión.

Actualización remota confirmada: [DropFlex · Optimización](https://chatgpt.com/plugins/Plugin_e3bca2a0f2208191a04ed05f2b5904fa), ID `Plugin_e3bca2a0f2208191a04ed05f2b5904fa`, ámbito personal privado, versión 1.3.4, release `pluginrel_6ac9b52049cc8191b03f09d24a4b3a18`. Se actualizaron la skill, su referencia de producción y las versiones de ambos manifiestos, preservando presentación, conexión y demás archivos. La lectura posterior confirmó el contenido guardado. El ZIP de actualización es `output/plugins/dropflex-optimizer-1.3.4-update.zip`; este guardado no despliega el servidor MCP ni demuestra que una conversación existente haya recargado la skill.

## Transferencia nativa de archivos · plugin y skill 1.3.5

Caso observado: la galería de seis PNG quedó generada, pero el chat reportó rechazo del identificador nativo y falta de permiso para enviar bytes por PUT. El historial del servidor registra tickets preparados que vencieron sin ingestión. Al abrir la conversación, el resumen del intento explica que se envió un identificador aislado, sin objeto de archivo completo; el servidor no conserva los argumentos rechazados antes de ejecutar la tool, por lo que no permite reconstruir el ID exacto enviado.

El contrato de `file_id` admite ahora un identificador opaco sin imponer un alfabeto de nombres, y `mime_type` es metadata informativa. Se mantienen la URL HTTPS, la validación de destino público, los límites de bytes y la decodificación de la imagen real antes de optimizarla. La skill, el contexto y las instrucciones MCP prefieren adjuntar el archivo nativo: ChatGPT entrega su objeto de transporte y el servidor descarga los bytes. Un ticket `pending` espera un PUT; no demuestra ni inicia ingestión. Sin capacidad de enviar bytes no se preparan tickets adicionales ni se regenera una pieza válida.

Validación: 51 tests de protocolo/skill/contrato/media y 11 de integración con Supabase local, Storage y worker reales, con la descarga externa simulada. La regresión usa un ID opaco sintético con separadores y MIME `application/octet-stream`, confirma asset optimizado, replay con URL renovada e idempotencia. Contratos exportados/validados, TypeScript y lint de archivos afectados pasan. Esta prueba local no certifica que el cliente móvil entregue un adjunto nativo; la aceptación en producción se registra a continuación.

Actualización remota confirmada: [DropFlex · Optimización](https://chatgpt.com/plugins/Plugin_e3bca2a0f2208191a04ed05f2b5904fa), ámbito personal privado, versión 1.3.5, release `pluginrel_6ac9b77701cc8191b8543c8cfa068a3c`. La lectura posterior verificó los cuatro archivos actualizados y que conexión, presentación y demás referencias permanecen intactas. Overlay: `output/plugins/dropflex-optimizer-1.3.5-update.zip`. El servidor y el catálogo de herramientas del cliente también deben cargar el contrato actualizado; guardar el plugin no demuestra esa recarga.

Aceptación en producción: el despliegue `e61d417` quedó Ready en Vercel y `get_visual_generation_context` devuelve las instrucciones nuevas. Se recuperó el ZIP de la conversación original y se verificaron tamaño y SHA-256 de sus seis PNG contra el manifiesto. Pasar la ruta absoluta de cada PNG al parámetro nativo `file` del adaptador del host funcionó: el host entregó el objeto completo, el servidor descargó los bytes y las seis operaciones terminaron `succeeded`. `list_visual_assets` confirmó seis assets `generated`, todos WebP optimizados. Quedaron propuestos sus seis destinos de galería y la portada; esta recuperación no aprueba ni publica las piezas. Se ejecutó «Actualizar herramientas» en la conexión existente, sin cambiar permisos ni cuenta. La prueba se hizo desde Codex con archivos recuperados: sigue pendiente verificar una nueva generación y subida automática desde el mismo cliente móvil.

## Prioridad comercial en la PDP · plugin y skill 1.3.7

Caso reportado: las respuestas del chat daban protagonismo a regulación y SERNAC al discutir ofertas y construir PDP. La fuente revisada no contenía una obligación de consultar SERNAC; sí pedía mostrar una prueba o limitación por cada hook y comprobar todos los tipos de contexto antes de avanzar. La skill y las instrucciones de inicialización del MCP ahora priorizan psicología del consumidor, valor percibido, JTBD, AIDA, CRO, AOV y utilidad real de pedidos contra entrega. Regalos, efecto GRATIS, bundles, anclaje y simulaciones se exploran con criterio comercial. La regulación se trata cuando el usuario pide ese análisis o existe un riesgo concreto que afecta la propuesta, con una explicación breve y una alternativa para avanzar.

Los hooks explican por qué podrían convertir; una limitación se menciona solo si cambia la decisión o ejecución. Las lecturas dependen del pedido y un dato faltante afecta únicamente al bloque cuyo contrato lo necesita. El estado vacío requiere una falta concreta, no cautela genérica. Se conservan los datos reales de reseñas, conteos, stock, especificaciones y resultados, los contratos de contenido, los permisos y las validaciones de publicación. La actualización no habilita publicar datos inventados como hechos.

Actualización remota confirmada: [DropFlex · Optimización](https://chatgpt.com/plugins/Plugin_e3bca2a0f2208191a04ed05f2b5904fa), ámbito personal privado, versión 1.3.7, release `pluginrel_6aca582fcb708191adf85f32a2bbdc7c`. La lectura posterior verificó los cuatro archivos cambiados: ambos manifiestos, la skill y su referencia de producción. La configuración, presentación y conexión se preservaron. Overlay: `output/plugins/dropflex-optimizer-1.3.7-update.zip`; paquete local completo: `output/plugins/dropflex-optimizer-1.3.7.zip`. Las instrucciones del servidor MCP están cambiadas en la fuente local y requieren desplegarse; este guardado remoto no despliega Vercel ni confirma la recarga de una conversación o caché instalada.

Validación local: 38 pruebas de importación de skill, protocolo MCP, contenido landing y contratos de página; typecheck y lint del archivo MCP pasan. La validación comprueba entrega y consistencia del paquete, no la respuesta que producirá un cliente con la nueva skill. Para probar el comportamiento, cargar la versión 1.3.7 en un chat nuevo y comparar ofertas/PDP con los mismos datos.

## Investigación limitada al producto · plugin y skill 1.3.8

La instrucción del comerciante reemplaza la excepción normativa de 1.3.7: en el flujo de optimización se prohíbe buscar, consultar o citar leyes locales, regulación, SERNAC y otros organismos reguladores. El mercado o la categoría no disparan investigación jurídica. Las búsquedas en internet se limitan a complementar información del producto: características, materiales, funcionamiento, medidas, compatibilidad, instrucciones de uso, documentación del fabricante o proveedor y comparaciones de productos. Se mantienen las fuentes y la distinción entre datos documentados e hipótesis.

Actualización remota confirmada: [DropFlex · Optimización](https://chatgpt.com/plugins/Plugin_e3bca2a0f2208191a04ed05f2b5904fa), ámbito personal privado, versión 1.3.8, release `pluginrel_6aca5b0172ac819192791aadb6772448`. La lectura posterior confirmó ambos manifiestos, la skill y la referencia de producción contra el overlay `output/plugins/dropflex-optimizer-1.3.8-update.zip`, preservando conexión y presentación. Las instrucciones del servidor MCP se actualizaron en la fuente local; su despliegue sigue pendiente. Un release guardado no certifica que un chat abierto haya recargado la skill.

Validación: 13 pruebas de protocolo MCP e importación de skill, typecheck y lint del archivo MCP pasan. La verificación comprueba la entrega de las instrucciones, no su ejecución por el modelo de otro cliente.

## Dirección de estudio suave y premium · plugin y skill 1.7.2

El comerciante eligió fondo limpio, luz difusa, sombras naturales, producto protagonista, tipografía sans serif y bloques informativos simples. Ese enfoque es ahora el predeterminado de galería, imágenes de PDP y creativos estáticos. La paleta se adapta al producto real, sin recolorear el empaque ni cambiar el acento guardado de la página. Las escenas varían según el argumento y el destino; una edición de estilo conserva el copy y la oferta elegidos. La referencia de producción concreta y persiste la dirección con campos existentes de `visual_system`, `scene`, `composition`, `message.overlay_text` y `avoid`, y la lleva a `resolved_instruction` y a la llamada al generador. No cambian contratos de Shopify, schemas MCP ni migraciones.

Fuente: commit `0984807`, verificado en `main` y enviado a `origin/main`. Vercel confirmó ese commit como Ready, Production y Current en `drop-pulse.vercel.app`. El plugin privado existente se actualizó a 1.7.2, release `pluginrel_6acc4524a22881918be2c4449bf44b66`. La lectura posterior coincide con los cuatro archivos afectados; se conservaron identidad, conexión, audiencia, presentación y los demás archivos. Paquete completo: `output/plugins/dropflex-optimizer-1.7.2.zip`; overlay: `output/plugins/dropflex-optimizer-1.7.2-update.zip`.

Pasaron skill-creator, 14 pruebas existentes de importación MCP, exportación/validación de contratos y `git diff --check`. Se ejecutó Refresh tools después del despliegue y se inspeccionaron nombres y descripciones de las tools de contexto, planificación y transferencia. ChatGPT muestra 1.7.2 y la nueva dirección en los detalles de la skill. No se comprobaron una llamada directa de producción a `tools/list` con OAuth ni la ejecución en una conversación nueva. El ejemplo visual elegido precede a esta distribución; no se generó otro lote ni se modificaron productos. [Registro de verificación](plugin-release-1.7.2.json). Abrir un chat nuevo con el plugin para cargar las instrucciones actualizadas.
