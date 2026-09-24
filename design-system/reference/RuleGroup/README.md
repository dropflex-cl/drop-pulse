# RuleGroup

Grupo de reglas del motor: Esperar, Pausar o Escalar.

- **Qué provees:** `kind` (`esperar` | `pausar` | `escalar`), `desc`, `level` ("Por conjunto", "Por anuncio" o "Campaña"), `add`, `children` (`RuleRow`).
- **Orden de evaluación:** Esperar va primero y manda: mientras una regla de espera no se cumple, no se pausa ni se escala. Luego Pausar, luego Escalar.
- **Nivel según estructura:** en ABO se pausa y se escala cada conjunto; en CBO se pausan anuncios y se escala el presupuesto de la campaña. El chip `level` lo dice.
- Colores: Esperar neutro, Pausar `destructive-soft`, Escalar `success-soft`, siempre con ícono y palabra.
