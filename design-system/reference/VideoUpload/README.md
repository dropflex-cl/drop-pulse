# VideoUpload

En la implementación vigente, «Aprobar» se representa como «Usar» y el contenido guardado como «Disponible». Es una decisión directa de uso, sin revisión obligatoria; las props anteriores mantienen compatibilidad.


Subir el MP4 montado y decidir.

- **Qué provees:** `state` (`idle` | `uploading` | `error` | `ready` | `approved` | `discarded`), `progress`, `file`, `size`, `done`, `duration`, `adset`.
- Solo MP4. Durante la carga, barra con `role="progressbar"`. Aprobado: «En Anuncios · <ángulo>» con Deshacer.
- Contexto y casos de uso: `creativos.md`.
