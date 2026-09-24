# Página del producto: la ficha y los componentes

La etapa escribe la página del producto en la tienda (no el texto del anuncio, que va en Anuncios). En vez de revisar textos sueltos, el comerciante ve **cómo se verá la página**: la ficha (campos nativos de Shopify) y los componentes de conversión del tema (`lib/shopify/components`), cada uno como vista previa fiel con el color del producto. Una sola escritura de la IA propone todo; el comerciante elige qué componentes van, los edita y los aprueba. Contrato técnico: `docs/spec-pagina-componentes.md`.

## Estados de la etapa

| Fase | Qué se ve | Componentes |
|---|---|---|
| `locked` | "Aprueba los 2 desarrollos de Ángulos" o "Primero, las imágenes" (Imágenes va antes), con enlace | `EmptyState` + `StageList` con el motivo |
| `start` | "Escribe la página de tu producto" y "Escribir la página con IA" (el botón "Continuar" de Imágenes lo dispara directo) | `EmptyState` |
| `writing` | "La IA está escribiendo la página", con esqueletos; se puede salir y Hoy avisa | `EmptyState busy` |
| `failed` | "No se pudo escribir la página" + el motivo + "Reintentar" | `EmptyState tone="error"` |
| `review` | La ficha por aprobar y los componentes con su vista previa | Ficha + `ComponentCard` + `StageMeter` |
| `done` | Ficha aprobada; "N componentes en la página"; "Continuar: Publicar" | igual |
| desactualizado | "Cambiaste tus ángulos. Reescribe lo que no aprobaste." | `Notice` |

Una reescritura en curso o con error no tapa lo escrito: va como `Notice` o alerta sobre la lista.

## La ficha

Tarjeta con la vista del comprador (`OfferPreview`: título, precio, tachado), la frase de la oferta, la descripción corta y "En Google" (título y descripción). Estado con `StatusBadge` ("Por aprobar" / "Aprobada"). Acciones: "Revisar ficha" (abre la hoja con sus 6 campos) y "Aprobar ficha". **Es lo único obligatorio**: la etapa termina con la ficha aprobada.

## La tarjeta de cada componente (`ComponentCard`)

- **Encabezado:** nombre ("Disponibilidad"), estado ("Propuesta de la IA", "Aprobado", "Tu versión") y la duda que responde, en una línea.
- **Vista previa:** el componente como en la tienda, en miniatura (`StoreFrame` con `scale`), recortada con un degradado si es larga. Tocarla abre la edición. Es decorativa (`aria-hidden`); al lado va lo que dice, en texto, para lectores de pantalla.
- **Avisos:** "Con datos de ejemplo" cuando un token ({count}, {min}…) todavía no tiene dato real; "Falta imagen" cuando está en uso y le faltan fotos.
- **"Editar"** y el interruptor **"Usar en la página"** (`Switch`, nombre accesible "Usar Disponibilidad en la página"). Activarlo aprueba; desactivarlo conserva el contenido.
- **Sin escribir:** los que necesitan reseñas aprobadas dicen cuántas y llevan a Reseñas.

Agrupados en el orden de la página: "Junto al botón de compra" (bloques de la columna del producto) y "Cuerpo de la página" (secciones).

## La hoja de edición

`Drawer` abajo en móvil y a la derecha en escritorio:

- Vista previa arriba, fija, que cambia mientras se escribe.
- Los campos se arman desde el esquema del componente (`lib/copy/form.ts`): texto con `CharCount` contra su límite, selector de ícono, opciones (política, tema), reseña aprobada, celda de comparativa, listas con agregar y quitar dentro de su mínimo y máximo.
- Los errores van bajo cada campo, en frases simples ("Pasa de 40 caracteres."). "Guardar" queda deshabilitado mientras haya alguno.
- **Fotos** (si el componente las lleva): el catálogo completo del producto (Información base e Imágenes) con su origen; tocar agrega en orden, tocar otra vez quita.
- "Guardar y usar" (componente) o "Guardar y aprobar" (ficha).

## Móvil y escritorio

- **Móvil:** barra superior con `StageMeter` (la ficha y un segmento por componente en uso), ficha, color de la página, componentes; barra fija con "Reescribir" y "Publicar".
- **Escritorio:** ruta a la izquierda, ficha y componentes al centro, y **"Tu página"** a la derecha: la página armada (ficha + componentes en uso, en orden) en un marco de tienda.

## Excepción de tokens

La vista previa es otra superficie (la tienda): su CSS sale del tema (`components/store-preview/store.generated.css`, generado desde los `{% stylesheet %}`), con colores de tienda fijos que no cambian con el modo oscuro de DropFlex. Está documentada en `scripts/valores-sueltos.sh`, igual que `OfferPreview`.

## Retirados

`PageOutline` y `CopySummary` (índice y resumen de bloques) ya no se usan: la vista previa de la página los reemplaza. Siguen en `reference/` como historia del diseño.
