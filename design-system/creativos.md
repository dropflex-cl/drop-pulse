# Etapa Creativos

Los anuncios para Meta de un producto: **Imágenes** (anuncios estáticos y chat de WhatsApp) y **Videos** (un UGC de ~30 s por ángulo). La etapa es opcional, se habilita al aprobar los ángulos y todo lo aprobado pasa a **Anuncios**, en el conjunto de su ángulo.

Pantallas: `PantallasCreativos1`–`8` (móvil) y `PantallasCreativosEscritorio1`–`2`. Cada pantalla lleva en su título los casos que cubre.

## Dónde va en la ruta

```
Información base → Reseñas → Ángulos → Textos → Imágenes → Publicar
                               └──────────→ Creativos (opcional) → Anuncios (opcional)
```

- Depende solo de **Ángulos**. Se puede hacer en paralelo a Textos e Imágenes de la página.
- Nunca bloquea **Publicar**. En la ruta aparece como opcional, y desde cualquier estado se puede ir directo a Anuncios a subir creativos a mano.

## Principios

1. **Revisar antes de pagar.** Claude propone conceptos gratis de revisar: familia, estilo, por qué, cómo se verá y los textos que irán dentro de la imagen. La imagen, que es lo que cuesta, se genera solo cuando el comerciante la pide, y cada botón que gasta muestra su costo (`· ≈ $95`).
2. **Una pieza, un estado.** Cada formato (feed 1:1, Stories 9:16, captura del chat, imagen clave, clip) es una `CreativePiece` con el mismo ciclo: vacía → en cola → generando → por revisar (con QA) → aprobada o descartada. Si falla, se puede recuperar o generar de nuevo.
3. **Deshacer en vez de confirmar.** Aprobar y descartar actúan de inmediato y muestran un toast con Deshacer. Solo se confirman las acciones que borran lo aprobado (Proponer otros).
4. **Nada queda esperando en pantalla.** Proponer (~1 min), escribir el guion (~1 min) y los clips (3 a 6 min) corren en segundo plano. La pantalla consulta el estado y avisa con un toast. El comerciante puede salir.
5. **Honestidad.** El chat de WhatsApp exige un aviso aceptado. El guion del UGC muestra el producto sin que la persona diga ser clienta ni cuente resultados propios.

## Casos de uso → UI

### 0 · Entrar y acceso

| Caso | UI |
|---|---|
| 0.1 Ángulos sin aprobar | `EmptyState` con ícono candado: «Primero, los ángulos» + **Ir a Ángulos**. Barra inferior con el enlace para saltarse la etapa (C1) |
| 0.2 Sin proveedor | `EmptyState` «Conecta un proveedor de imágenes». En la pestaña Videos dice «Conecta Higgsfield». Botón **Ir a Ajustes** → `/settings#creativos` (C2) |
| 0.3 Saltarse la etapa | Siempre visible mientras no haya piezas: «Es opcional: ir a Anuncios y subir creativos a mano». Con piezas, **Continuar a Anuncios** |
| 0.4 Imágenes / Videos | `SegmentedControl` bajo la barra superior. Cada pestaña guarda su propio estado y su propio flujo |
| 0.5 Asistente y gasto | `AiCostChip` (tu `AiCostButton`) y `AssistantButton` con alcance «Creativos» en la barra superior. En escritorio el asistente lleva etiqueta |

### 1 · Pestaña Imágenes

| Caso | UI |
|---|---|
| 1.1 Proveedor | `ImageProviderPicker`: radio Higgsfield o Gemini con costo y tiempo por pieza, «Se guarda para esta etapa». Si no está conectado, aparece deshabilitado con el motivo. En la lista se muestra en su forma `compact` con **Cambiar** (C3, C6) |
| 1.2 Proponer | **Proponer anuncios · ≈ $30**, con la foto base visible y el aviso «Tarda ~1 min. Puedes salir» (C3) |
| 1.3 Esperar | `EmptyState busy` + **Volver al producto**. Al terminar: toast «La IA propuso tus anuncios: 6 conceptos» con **Ver**. Si falla: toast con **Reintentar** (C4, C5) |
| 1.4 Reintentar | `EmptyState tone="error"` con **Reintentar · ≈ $30** (C5) |
| 1.5 Proponer otros | Enlace en la cabecera de la lista. Abre una hoja que explica qué se reemplaza, qué sigue en Anuncios mientras tanto, que se borran también las aprobadas y **cuántas se conservan** (en Meta o usadas por un anuncio). Botón destructivo (C13) |
| 1.6 Ver conceptos | Agrupados por ángulo, con slots 1–3. `CreativeConcept` compacto en la lista y completo en el detalle: familia, estilo (preset o «Edición directa»), por qué, cómo se verá y los textos dentro de la imagen (C6, C7) |
| 1.7 Editar textos | Mismo `CreativeConcept` en modo edición. `CharCount` por rol con su límite. Si se pasa: fondo de error, mensaje y **Guardar** deshabilitado. Mientras se genera una pieza, **Editar** se deshabilita y explica por qué (C8, C9) |
| 1.8 Generar 1:1 | Botón en la pieza con el costo; en el detalle, en la barra fija (C7) |
| 1.9 Generar 9:16 | La pieza Stories aparece `locked` («Primero la 1:1») hasta que exista la 1:1 (C7, C11) |
| 1.10 Lote | Barra fija **Generar N · ≈ $X** (solo cuenta las que faltan) (C6) |
| 1.11 Otro proveedor | En la pieza revisada: **Generar con Higgsfield · ≈ $95**. Si hay mezcla, cada pieza muestra su proveedor (C6, escritorio) |
| 1.12 Progreso | Estados `queued` («En cola») y `generating`. Con `retry`: «Segundo intento, sin estilo» (C9) |
| 1.13 QA | `QaResult`: «Texto y producto revisados» o «Revisa: N detalles» con la lista. En la fila: «Revisa: 1 detalle» (C10) |
| 1.14 Tamaño completo | Enlace «Tamaño completo ↗» (`target="_blank"`, `rel="noopener"`) (C10) |
| 1.15 Aprobar | La pieza pasa a «En Anuncios». Toast «Aprobada. Ya está en Anuncios.» con **Deshacer** (C11) |
| 1.16 Descartar | La pieza queda apagada, «El archivo se borra en 2 min». Toast con **Deshacer** (C12) |
| 1.17 Deshacer | Desde el toast o con el botón **Deshacer** de la pieza (reopen) (C11) |
| 1.18 Recuperar | Si el proveedor recibió la pieza: «Higgsfield sí la recibió: recupérala sin volver a pagar» + **Recuperar** como acción principal (C12) |
| 1.19 Generar de nuevo | Acción secundaria con costo. Si no se puede recuperar, **Reintentar · ≈ $X** es la principal (C12) |
| 1.20 Continuar | **Continuar a Anuncios** deshabilitado hasta tener al menos una pieza aprobada. El motivo se muestra al lado (C6) |

### 2 · Chat de WhatsApp (un concepto por ángulo, dentro de Imágenes)

| Caso | UI |
|---|---|
| 2.1 Crear | Hoja con `ChatConsent`: aviso «Es una conversación armada», casilla obligatoria y **Crear chat** deshabilitado hasta marcarla. El servidor exige `acknowledged` (W1) |
| 2.2 Vista previa | `ChatPreview`: contacto, «en línea», burbujas con hora y foto del producto con pie. El subtítulo repite «conversación armada» (W2) |
| 2.3 Editar | Pantalla con el contacto, cada mensaje (quién y a qué hora) y el pie de la foto. Guarda con `PATCH { chat }` (W3) |
| 2.4 Captura | **Generar captura 9:16 · ≈ $X**. «Solo 9:16» (W2) |
| 2.5 Otro chat | **Otro chat · ≈ $X** (W2) |
| 2.6 Decidir | La captura es una `CreativePiece` con ratio 9:16: aprobar, descartar, recuperar y reintentar funcionan igual que en 1.13–1.19 |

No se dibuja ningún logo ni interfaz de WhatsApp en el design system: la vista previa usa colores neutros. El aspecto final de la captura lo define el render del servidor.

### 3 · Pestaña Videos: un UGC de ~30 s por ángulo

Arriba: selector de ángulo (chips) y `UgcStepper` con los 5 pasos. Un paso se habilita al aprobar el anterior. En escritorio, el stepper va vertical, con el estado de cada paso.

| Caso | UI |
|---|---|
| 3.1 Escribir | `SegmentedControl` «Formato del video»: **Persona** (UGC de ~30 s, por defecto) o **Mascota animada** (~25 s: lo que tiene el problema, en 3D, cuenta su historia). Debajo, el título y la bajada del formato elegido + **Escribir el guion · ≈ $25** (V0). «Otro guion» y «Reintentar» siguen en el formato del guion |
| 3.2 Esperar | `EmptyState busy` «Escribiendo el guion» y aviso al terminar (V0) |
| 3.3 Reintentar | `EmptyState tone="error"` con **Reintentar** (V0) |
| 3.4 format_fit | `Notice tone="info"` sobre el guion: «Este ángulo rinde más como imagen», «pide una persona real», «rinde más con una mascota animada» o «rinde más con una persona». Informa, no bloquea (V1). Cuando recomienda el otro formato de video, debajo del aviso: **Escribir como mascota · ≈ $X** o **Escribir con persona · ≈ $X** (reemplaza el guion del ángulo) |
| 3.5 Editar | `ScriptShot` por toma: hablada (lo que dice) o de apoyo (lo que se ve), el texto en pantalla y el cierre. Si ya había clips, la toma cambiada muestra «Se genera de nuevo» (V1) |
| 3.6 Aprobar / otro | **Aprobar guion** (principal), **Editar**, **Otro guion · ≈ $25**. Desaprobar vuelve al guion editable |
| 3.7 Imágenes clave | **Generar la que falta · ≈ $X** (o todas, la primera vez) (V2) |
| 3.8 QA | `KeyframeTile` con el QA de manos, cara y producto en una línea |
| 3.9 Decidir | Aprobar o descartar en cada tile, **Aprobar todas (N)**, **Volver a revisar** y **Pedir otra** (V2) |
| 3.10 Clips | `ClipRow` por toma: las habladas en «Seedance · con voz» y las de apoyo en «Kling», «3 a 6 min». `Notice` de que puede salir (V3) |
| 3.11 Recuperar / rehacer | En el clip fallido: **Recuperar** si el proveedor lo recibió y **Rehacer · ≈ $X** (V3) |
| 3.12 Montaje | `MontagePackage`: **Descargar paquete JSON**, vencimiento de las URLs firmadas (24 h), el comando `python scripts/ugc-montage.py … --music` con la música como opcional. Si vencieron: «Generar el paquete de nuevo» (no vuelve a crear los clips) (V4) |
| 3.13 Subir | `VideoUpload`: zona de carga «Solo MP4», barra de progreso con MB y tiempo, **Cancelar** y error si no es MP4 (V5) |
| 3.14 Aprobar | Vista del video con **Aprobar** o **Descartar**. Al aprobar: «En Anuncios · Ángulo principal» y toast con **Deshacer** (V6) |

## Escritorio

- **Imágenes:** la cabecera lleva la pestaña, el costo de IA, el asistente y **Continuar a Anuncios**. Al centro van los conceptos por ángulo en dos columnas y abajo una barra con el resumen y **Generar N**. A la derecha, la pieza seleccionada en grande con su QA y las acciones (atajos A y D).
- **Videos:** a la izquierda, el ángulo y el stepper vertical con el estado de cada paso. Al centro, el paso actual. A la derecha, el paso siguiente deshabilitado, con el motivo.

## Accesibilidad

- `ImageProviderPicker` es un `radiogroup`; un proveedor no conectado queda `disabled` y dice por qué.
- El progreso usa `role="status"` y la carga del video `role="progressbar"` con valor. El toast es `role="status"`.
- El QA con detalles es `role="status"` y no depende solo del color: lleva ícono y texto «Revisa: N detalles».
- El enlace «Tamaño completo» abre una pestaña nueva y lo indica con el ícono externo.
- **Editar** deshabilitado se relaciona con su motivo mediante `aria-describedby`.
- Los botones que gastan dicen cuánto en el texto visible, no solo en un tooltip.

## Costos de ejemplo

Los montos de las pantallas son de ejemplo (en la moneda de la tienda). Los reales salen del proveedor elegido y del mismo cálculo del indicador de costo de IA.
