# ReferenceImage

Una imagen de origen (de Shopify, subida o traída por enlace) que la IA usará como referencia.

| state | Qué muestra |
|---|---|
| `ready` | La imagen, su origen (Shopify, Subida o Enlace) y el botón x para no usarla |
| `excluded` | Apagada en gris, "No se usa" y botón + para volver a usarla |
| `uploading` | Porcentaje y barra (`progress` de 0 a 1) |
| `error` | Fondo `destructive-soft`, el motivo en `error` y "Reintentar" |

- **Qué provees:** `src`, `alt`, `source` (`shopify` | `upload` | `url`), `state`, `cover` (portada actual en la tienda), `progress`, `error`.
- Excluir no borra nada en Shopify: solo le dice a la IA que no la use (por ejemplo, una imagen con texto del proveedor).
- El botón de excluir o incluir tiene área de 40×40 aunque el círculo mida 24.
