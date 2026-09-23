# ReviewItem

Una reseña importada para aprobar, rechazar o editar, con sus alertas y su texto original a mano.

- **Qué provees:** `author` (anonimizado: "M***a"), `country`, `date`, `rating`, `variant`, `text`, `photos`, `translated`, `original`, `lang`, `flags` (alertas de la IA), `state` (`pending` | `approved` | `rejected` | `published`), `editing`, `edited`, `hideActions`.
- Acciones fijas en este orden: Rechazar · Editar · Aprobar (la principal a la derecha). Al aprobar o rechazar, la tarjeta sale de "Por revisar" y aparece un toast con "Deshacer".
- **Editar tiene límites a propósito:** solo el texto, nunca la calificación, el autor ni la fecha. El texto original queda guardado y visible al editar, y la reseña lleva la marca "Editada por ti". La nota bajo el campo lo recuerda: corregir traducción u ortografía sin cambiar lo que opinó el cliente.
- Alertas (`flags`, en ámbar) para decidir rápido: "Menciona otra marca", "Habla del envío", "Muy corta", "Posible dato personal", "Lenguaje ofensivo". Son sugerencias; nunca rechazan solas.
- Rechazada: tachada y atenuada, con "Deshacer". Aprobada o publicada: `StatusBadge` correspondiente.
