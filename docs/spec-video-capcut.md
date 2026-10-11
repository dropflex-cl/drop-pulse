# UGC: MCP, Higgsfield y CapCut local

DropFlex persiste el contenido y los medios; la edición final se hace desde una tarea local de ChatGPT Work/Codex en el Mac. La dirección de arte puede usar las capacidades disponibles de CapCut, sin el catálogo cerrado de composiciones de Remotion. No se instala un worker de render en el SaaS.

## Flujo vigente

1. El chat recupera contexto y contrato, escribe el guion y plan y los guarda con `save_ugc_content`. El contenido válido MCP queda aprobado. Puede incluir `content.editing_brief` con objetivo, dirección de arte, ritmo, subtítulos y sonido. No hace otra llamada a Anthropic del servidor para decidir la edición.
2. Para subir keyframes creados externamente, utiliza `content.keyframe_source: "external"`. Guardar crea las filas K como destinos `ugc_shot`, sin operación de pago. Recupera sus IDs y etags con `get_visual_generation_context`. Prepara/ingiere la imagen con las tools visuales y asigna el asset aprobado con `bind_visual_asset` al destino exacto. La proyección existente crea la imagen clave aprobada; una imagen de storyboard B no se trata como clip de video. Si se elige `higgsfield` o se omite el campo, se conserva la generación existente de imágenes.
3. Recupera el etag/revisión actual y solicita `generate_ugc` con `stage: "clips"` y las claves A/B explícitas. Las imágenes clave deben estar disponibles y aprobadas. Higgsfield usa la clave del comerciante; la cola persistida, los envíos ambiguos y el cron existente conservan sus mecanismos. No hay nuevos renders automáticos ni worker persistente.
4. Consulta `get_generation_status` hasta terminar y recupera `get_ugc_montage`. El JSON v2 es un manifiesto de origen, no un proyecto de CapCut. Los campos nuevos `source` y `editing_brief` son opcionales y compatibles con paquetes anteriores. Las URLs se firman por 24 horas; renovar no vuelve a generar.
5. En el Mac, usa la skill `dropflex-capcut`. Su helper descarga los medios, verifica hashes y, con FFmpeg, obtiene duración real y fotogramas. Escribe `package.local.json` sin URLs firmadas y `analysis.json`. La skill registra decisiones en `edit-decisions.json`, mejora la narrativa y opera CapCut mediante una integración conectada o control nativo disponible.
6. Los subtítulos vienen de la voz usada: auto-captions de CapCut o transcripción local disponible. Se corrige el texto contra el guion y se recalculan tiempos si cambia la voz. Un SRT UTF-8 se importa como texto editable; el estilo se aplica en CapCut. No se calculan tiempos exactos a partir de `seconds`, que es la duración prevista.
7. Exporta un MP4 vertical 9:16, H.264/AAC, 10–60 s y ≤100 MB. Súbelo por la UI de Video final y revísalo. Aprobarlo permite usarlo en Anuncios o la página; publicar es otra acción. El proyecto CapCut y las decisiones locales se conservan para revisiones.

Ejemplo de extensión a `content` al guardar el guion:

```json
{
  "keyframe_source": "external",
  "editing_brief": {
    "objective": "Mostrar el problema y el detalle que lo resuelve",
    "art_direction": "Primeros planos, tipografía expresiva y espacio para ver el producto",
    "pacing": "Entrada rápida; pausa breve en la demostración",
    "captions": "Texto legible que acompañe la voz sin tapar el producto",
    "sound": "Voz protagonista, música discreta y efectos puntuales"
  }
}
```

El guion, el brief y los clips quedan en DropFlex. `get_ugc_content` por `script_id` recupera el brief. El plan preciso de edición se decide después de inspeccionar los clips en el Mac y se guarda localmente; aún no hay tool MCP para guardar ese plan posterior, subir el MP4 final o guardar el proyecto CapCut. Volver a guardar puede modificar el guion vigente: no usar esa operación para cambiar únicamente una edición ya montada.

## CapCut y disponibilidad

[CapCut × Codex](https://www.capcut.com/tools/capcut-x-codex) publica una integración oficial para borradores editables, ajustes de pistas, títulos, subtítulos y assets. La instalación y autorización son independientes de esta skill. La página anuncia disponibilidad por región/app/cuenta; sus documentos no prueban que cada operación se ejecute en el Mac. No prometer exportación local hasta comprobar las tools conectadas. Para exigir render en el Mac, usar CapCut Desktop mediante control nativo y su exportación.

CapCut Desktop admite [SRT y edición de estilos](https://www.capcut.com/help/how-to-import-subtitles). No se genera ni se modifica `draft_content.json` como formato estable. Si falta una integración o control nativo, la skill entrega el material y las decisiones, indicando que el montaje está pendiente.

## Retiro de Remotion y activación

La app recupera **Descargar paquete JSON** y **Ya lo monté: subir el video**. No hay Player, worker, Dockerfile ni dependencias Remotion. El Python anterior queda como herramienta histórica; ya no se propone en la pantalla.

Aplicar las migraciones del proyecto en orden. `20261210000000` permanece como historial; `20261212000000` prepara destinos de keyframes externos y `20261213000000` revoca el worker y cancela sus trabajos sin borrar datos. No se cambian auth, Shopify, campañas ni el cron de Higgsfield. Los archivos externos usan las proyecciones y los prefijos de producto existentes; el borrado normal los limpia.

La skill está versionada en `skills/dropflex-capcut/`. Puede copiarse a `~/.codex/skills/dropflex-capcut` para tareas locales que descubran skills desde esa ruta. Una instalación en Codex no garantiza disponibilidad en otro host de ChatGPT Work; ese host debe cargar la misma skill y tener control del Mac o la integración conectada.

Pruebas sin proveedores de pago:

```bash
npm run ugc:test:local
npx vitest run lib/video/video.test.ts lib/product-intelligence/ugc.test.ts
node --test skills/dropflex-capcut/scripts/prepare.test.mjs
npm run pi:contracts
npm run typecheck
```

La edición con CapCut no se declara probada hasta abrir un proyecto y verificar exportación con una integración/control nativo real. Las pruebas de preparación no sustituyen esa comprobación ni una generación pagada de Higgsfield.

Validación del 11 de octubre de 2026 sobre una copia aislada con solo este cambio: pasan 60 pruebas de video/contrato UGC, 3 del helper y las 2 nuevas de destinos externos y retiro de Remotion. También pasan typecheck, exportación y validación de contratos, ESLint de los archivos del cambio y check:valores. En el workspace compartido, la suite UGC completa tiene 6 fallos en expectativas anteriores de versiones e invalidación de contexto, mientras se modifica el modelo de contenido vigente en otro trabajo. El typecheck global tiene un error en `current-content.local.test.ts` y el validador de contratos rechaza una expectativa anterior de etag obligatorio. Esos fallos del workspace compartido no están resueltos por esta entrega; no se incluyen esos cambios paralelos en el commit. Las migraciones nuevas se aplicaron solo a Supabase local; no se desplegó producción.
