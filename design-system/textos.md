# Textos: la página del producto

La etapa escribe la página del producto en la tienda (no el texto del anuncio, que va en Anuncios). La UI reutiliza el flujo de revisión existente —una propuesta a la vez, con Deshacer y atajos A/D/E— y le agrega lo que la página necesita: de qué ángulo sale cada bloque, su límite, qué pasa si se descarta y los estados de la etapa.

## Estados de la etapa

| Fase | Qué se ve | Componentes |
|---|---|---|
| `locked` | "Aprueba los 2 desarrollos de Ángulos" con enlace | `EmptyState` + `StageList` con el motivo |
| `start` | "Escribe la página de tu producto" y "Escribir textos con IA" (el botón "Continuar: Textos" de Ángulos lo dispara directo) | `EmptyState` |
| `writing` | "La IA está escribiendo los textos", con esqueletos; se puede salir y Hoy avisa | `EmptyState busy` |
| `failed` | "No se pudieron escribir los textos" + el motivo + "Reintentar" | `EmptyState tone="error"` |
| `review` | Un bloque a la vez; contador "8 de 14 aceptados" en la barra y en la ruta | `ReviewCard` + `StageMeter` + `PageOutline` (escritorio) |
| `done` | Lo aprobado por sección, "Rehacer descartados" y "Continuar: Imágenes" | `CopySummary` |
| desactualizado | Aviso sobre la lista: "Cambiaste tus ángulos. Reescribe los textos que no aprobaste." | `Notice` |

## La tarjeta de cada bloque

- **Encabezado:** sección de la página · nombre del bloque · "Obligatorio" si corresponde · posición ("9 de 14").
- **Original:** "Hoy en Shopify" solo en los bloques que lo tienen (título y SEO; en "Cómo funciona", la descripción actual como referencia).
- **Propuesta:** con el `RoleChip` del ángulo del que sale (principal o secundario). Las preguntas frecuentes muestran pregunta y respuesta juntas.
- **Contador** contra el límite del bloque; pasado el límite no se puede guardar.
- **Nota de la IA:** por qué lo propone, en una frase.
- **Qué pasa si descartas**, antes de decidir: "se mantiene el título actual de Shopify" o "este bloque no va en la página".
- **Datos que faltan** (`missing_inputs`): un `Notice` sobre el bloque ("Completa el plazo de entrega y tu WhatsApp") para completarlos al editar.

## Obligatorios

Título, nombre corto, descripción corta, frase de la oferta, cómo funciona, envío y pago, y los dos de Google. Los que no tienen original de Shopify (descripción corta, oferta, envío y pago) no pueden quedar vacíos: si se descartan, quedan como "Falta aprobar" en `PageOutline` y `CopySummary`, y "Continuar: Imágenes" sigue deshabilitado hasta aprobar una versión (propia o reescrita).

## Lo que no se incluye a propósito

La garantía solo aparece si la ficha trae días de garantía. Si no, `PageOutline` y `CopySummary` la muestran como "No se incluye · Tu ficha no tiene días de garantía", para que no parezca un olvido.

## Móvil y escritorio

- **Móvil:** un bloque a la vez con las acciones en la barra fija; el contador de la barra superior abre `PageOutline` como hoja.
- **Escritorio:** ruta a la izquierda, bloque al centro con atajos, y la página completa como índice a la derecha para saltar entre bloques.
