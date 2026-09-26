# ImageProviderPicker

Elige el proveedor de imagen de la etapa Creativos (Higgsfield o Gemini). La elección se guarda por etapa y cambia el costo mostrado.

- **Qué provees:** `value`, `providers` ({ id, name, cost, eta, connected }), `compact` (fila con «Cambiar»), `label`.
- Es un `radiogroup`. Un proveedor sin conectar queda deshabilitado con «No conectado · conéctalo en Ajustes».
- Contexto y casos de uso: `creativos.md`.
