# RuleRow

Una regla del motor escrita como frase, con los valores editables en línea.

- **Qué provees:** `parts` (texto y valores `{ value, select, prefix, suffix }`), `off`.
- Cada valor es un control: los que tienen triángulo abren un menú (métrica, multiplicador, ventana de tiempo); los otros son campos numéricos.
- El interruptor activa o desactiva la regla sin borrarla; el menú ⋯ permite duplicar o eliminar.
- Las cifras usan la moneda y el CPA límite de Ajustes: si el límite cambia, las reglas expresadas como "×" se ajustan solas.
