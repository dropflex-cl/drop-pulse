# PageOutline

Índice de los bloques de la página en su orden real, con el estado de cada uno; permite saltar entre ellos.

- **Qué provees:** `groups` (`{ title, items: [{ label, state, required }] }`), con `state` = `accepted` | `edited` | `pending` | `current` | `discarded` | `missing` | `omitted`.
- Escritorio: columna derecha de la etapa Textos. Móvil: se abre como hoja desde el contador de la barra superior ("8 de 14").
- `omitted` explica lo que no se incluye a propósito (por ejemplo, Garantía sin días de garantía en la ficha), para que no parezca un olvido.
- El estado va en el punto y, para lectores de pantalla, en texto oculto.
