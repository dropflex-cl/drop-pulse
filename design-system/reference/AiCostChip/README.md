# AiCostChip

Indicador compacto del costo de IA de un producto, en la barra superior; abre el detalle.

- **Qué provees:** `total` (en la moneda de la tienda), `cap` (tope por producto, opcional), `running` (una generación en curso: el ícono gira y el total se actualiza al terminar).
- La minibarra muestra cuánto del tope se usó. Desde el 80% el borde y la barra pasan a `warning`; sobre el tope, a `destructive-soft` con texto `destructive`.
- Área táctil de 44px aunque el chip mida 32. Nombre accesible con el total y el porcentaje.
- No usa `primary`: es información, no una acción principal.
