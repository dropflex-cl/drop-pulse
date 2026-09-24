# AiRunList

Historial de llamadas a la IA de un producto: qué se hizo, en qué etapa, cuándo y cuánto costó.

- **Qué provees:** `runs` (`{ kind: 'gen' | 'regen' | 'retry' | 'fail', what, stage, when, cost, model, tokens }`), `audience`.
- Más reciente primero. Los fallidos (`destructive-soft`) y los reintentos (`warning-soft`) se distinguen por ícono y palabra, no solo por color.
- Un fallo muestra su costo si se cobró: el historial explica el total, no lo maquilla.
- `audience="admin"` agrega modelo y tokens en la línea de detalle.
