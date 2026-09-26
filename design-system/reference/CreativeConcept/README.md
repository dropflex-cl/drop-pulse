# CreativeConcept

Un concepto de anuncio propuesto por Claude, para revisar antes de pagar la imagen.

- **Qué provees:** `slot` (1–3 dentro del ángulo), `title`, `family`, `style`, `styleKind` (`preset` | `direct`), `why`, `look`, `texts` ({ role, value, limit }), `pieces` (props de `CreativePiece`), `editing`, `locked` (hay una pieza generándose), `compact` (solo cabecera y piezas), `emphasis` (`review` | `normal` | `done`; si no se pasa, se deduce de las piezas).
- En edición, cada texto usa `CharCount` con su límite por rol y muestra el error si se pasa. Con `locked`, Editar se deshabilita y explica por qué.
- Contexto y casos de uso: `creativos.md`.
- **Peso por estado:** `review` lleva borde de aviso, título de 16 px, miniaturas de 64 px y «Revisar» como botón suave; `normal` va sobre el fondo, con «Generar» como botón fantasma (el lote de la barra fija es la acción principal); `done`, en compacto, se pliega a una fila con check y miniaturas. Familia y estilo son una línea de texto apagado, no píldoras.
