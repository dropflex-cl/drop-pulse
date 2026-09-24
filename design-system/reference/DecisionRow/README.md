# DecisionRow

Lo que el motor decidió para un conjunto (ABO) o anuncio (CBO), con la cifra que lo justifica y la regla que lo disparó.

- **Qué provees:** `decision` (`esperar` | `mantener` | `pausar` | `pausado` | `escalar`), `label`, `name`, `metrics`, `reason`, `rule`, `progress` (solo esperar), `actions`.
- **Solo recomendar:** Pausar y Escalar traen la acción ("Pausar conjunto", "Subir a $12.000") y la alternativa ("Mantener", "Ignorar"). Nada cambia en Meta sin ese toque.
- **Automático:** el motor aplica y la fila queda como "Pausado por el motor" o "Escalado por el motor" con hora y "Reactivar"/"Deshacer".
- Esperar muestra cuánto falta para poder decidir, con una barra: la paciencia se ve como progreso, no como inacción.
