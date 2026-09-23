# EmptyState

Estado de una etapa sin contenido que revisar: bloqueada, lista para empezar, generando o con error.

- **Qué provees:** `icon`, `title`, `body`, `action`, `secondary`, `tone` (`neutral` | `error`), `busy` (anima el ícono y usa `role="status"`), `children` (por ejemplo, esqueletos).
- El título dice qué falta o qué pasa; el cuerpo, por qué o qué viene; la acción, cómo seguir. Nunca un estado vacío sin salida.
- `tone="error"`: borde `destructive`, `role="alert"` y "Reintentar" como acción principal.
