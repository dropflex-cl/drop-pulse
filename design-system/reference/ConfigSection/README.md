# ConfigSection

Sección plegable del configurador con un resumen de una línea cuando está cerrada.

- **Qué provees:** `index`, `title`, `summary`, `open`, `done`, `edited`, `error` (reemplaza el resumen por el problema), `children`.
- El resumen deja revisar toda la configuración sin abrir nada: "Chile · 23+ · abierto (Advantage+)".
- Agrupadas dentro de `df-cfgs` en móvil (una sola tarjeta con divisores); sueltas en escritorio.
- Una sección con error bloquea "Revisar y lanzar" y lleva el foco a ella.
