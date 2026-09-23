# ReviewCard

Compara el contenido original con la propuesta de la IA y decide: descartar, editar o aceptar.

- **Qué provees:** `field`, `original` (puede faltar si no había), `proposal`, `index`/`total`, `state` (`pending` | `editing` | `accepted` | `discarded`), `keys` (muestra atajos A / D / E en escritorio), `hideActions` cuando las acciones viven en la barra fija.
- Móvil: original arriba en `muted` y tono apagado; propuesta abajo con borde `foreground`, porque es lo que decides. Escritorio: lado a lado.
- Al aceptar o descartar, avanza sola a la siguiente propuesta (`duration-base`, `ease-exit`) y muestra `Toast` con “Deshacer”. Sin confirmaciones.
- Editar convierte la propuesta en un área de texto con borde `primary`; “Guardar y aceptar” es una sola acción.
- Orden de botones fijo: Descartar · Editar · Aceptar (el principal, a la derecha, bajo el pulgar).

**Bloques de página (etapa Textos).** Props adicionales:
- `section` (grupo de la página), `required` (chip "Obligatorio"), `angle` (`primary` | `secondary`: muestra el `RoleChip` del ángulo del que sale), `note` (por qué lo propone la IA, en una frase), `limit` + `count` + `unit` (`CharCount`), `faq` (`{ q, a }`: pregunta y respuesta en la misma tarjeta), `originalLabel` ("Hoy en Shopify"), `discardHint` (qué pasa si se descarta: "se mantiene el título actual de Shopify" o "este bloque no va en la página"), `missing` (dato que la IA no tiene), `edited` (aprobado con tu versión).
- Pasado el límite, "Guardar y aceptar" se deshabilita.
