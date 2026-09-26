# CreativePiece

Una pieza generada (feed 1:1, Stories 9:16, captura del chat) en todos sus estados.

- **Qué provees:** `ratio` (`1:1` | `9:16`), `label`, `state` (`empty` | `locked` | `queued` | `generating` | `review` | `approved` | `discarded` | `failed`), `provider`, `cost`, `retry` (segundo intento sin estilo), `qa` (lista), `recoverable`, `error`, `eta`, `imageIndex`, `variant` (`row` | `full`).
- `row` va dentro de `CreativeConcept`; `full` es la revisión con imagen grande, QA, «Tamaño completo ↗» y Aprobar/Descartar. Todo botón que genera muestra su costo. Fallida y recuperable: Recuperar es la acción principal y Generar de nuevo la secundaria.
- Contexto y casos de uso: `creativos.md`.
