# CreativeSlot

Un creativo subido (imagen o video) y el conjunto que va a generar.

- **Qué provees:** `name`, `type` (`image` | `video`), `ratio`, `duration`, `state` (`ready` | `uploading` | `processing` | `error`), `progress`, `error`, `adset`.
- En ABO cada creativo crea un conjunto ("→ Conjunto 1"); en CBO todos van como anuncios de los conjuntos definidos.
- Estados: subiendo (porcentaje), procesando (Meta procesa el video y todavía no se puede usar), listo, error con el motivo (formato, peso o proporción).
- Se agregan con `ImageUploader` configurado para imágenes y videos; se reordenan arrastrando.
