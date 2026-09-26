# CreativeConcept

Un concepto de anuncio propuesto por Claude, para revisar antes de pagar la imagen.

- **Qué provees:** `slot` (1–3 dentro del ángulo), `title`, `family`, `style`, `styleKind` (`preset` | `direct`), `why`, `look`, `texts` ({ role, value, limit }), `pieces` (props de `CreativePiece`), `editing`, `locked` (hay una pieza generándose), `compact` (solo cabecera y piezas).
- En edición, cada texto usa `CharCount` con su límite por rol y muestra el error si se pasa. Con `locked`, Editar se deshabilita y explica por qué.
- Contexto y casos de uso: `creativos.md`.
