# AngleGroup

Sección de un ángulo: el nivel más alto de la lista de creativos, por encima de los conceptos.

- **Qué provees:** `role` (`primary` | `secondary`), `name`, `counts` ({ review, pending, approved }), `collapsed` (con botón para plegar), `chat` (el `ChatModule` del ángulo, al pie), `headerOnly` + `action` (solo la cabecera, como en Videos).
- Cabecera: `RoleChip`, nombre en 18 px seminegrita y contador donde «por revisar» va en color de aviso. El principal abre desplegado; el secundario puede plegarse. Dentro, los conceptos van ordenados por lo que piden: por revisar, sin generar y aprobados.
- Contexto y casos de uso: `creativos.md`.
