# ReviewImporter

Trae reseñas de un producto de AliExpress a partir de su enlace, con filtros antes de importar.

| state | Qué muestra |
|---|---|
| `idle` | Campo de enlace, filtros (calificación mínima, traducir, solo con fotos) e "Importar reseñas" |
| `fetching` | Barra y detalle ("Leyendo reseñas… 112 de 204"). Sigue en segundo plano si el usuario sale |
| `done` | Resumen ("48 importadas · promedio 4,6") y la acción para revisarlas |
| `error` | Borde `destructive`, el motivo y cómo arreglarlo |

- **Qué provees:** `state`, `url`, `error`, `progress`, `detail`, `summary`, `actions`, `minStars` (`'1'` | `'4'` | `'5'`), `photosOnly`, `filters` (false para ocultarlos), `primary` (false para el botón secundario), `title`.
- Valida en el cliente que el enlace sea de AliExpress antes de llamar al backend. Mensajes de error concretos: enlace de otra tienda, producto sin reseñas, AliExpress no respondió ("Intenta de nuevo en unos minutos").
- Por defecto trae 4★ o más y traduce al español, guardando siempre el texto original.
- Importar otra vez no duplica: el backend deduplica y el resumen dice cuántas nuevas llegaron.
