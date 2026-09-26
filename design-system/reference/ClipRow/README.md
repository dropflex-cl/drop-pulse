# ClipRow

Un clip generado desde su imagen clave.

- **Qué provees:** `n`, `kind`, `state` (`queued` | `generating` | `done` | `failed`), `eta`, `cost`, `recoverable`, `duration`, `imageIndex`.
- Fallido: Recuperar (si el proveedor lo recibió) y Rehacer con costo.
- Contexto y casos de uso: `creativos.md`.
