# StructurePicker

Elige la estructura de la campaña: ABO (presupuesto por conjunto) o CBO (presupuesto de campaña). Son las dos únicas opciones.

- **Qué provees:** `value` (`abo` | `cbo`), `label`.
- Cada opción dice para qué sirve en una frase y trae un mini diagrama: el bloque azul marca dónde vive el presupuesto (en cada conjunto o en la campaña).
- Cambiar la estructura filtra las plantillas (`PresetSelect`) y cambia qué campos se muestran: en ABO, presupuesto y puja por conjunto; en CBO, en la campaña. Las reglas del motor cambian de nivel (ver `RuleGroup`).
- Si ya hay cambios hechos, cambiar de estructura pide confirmación y dice qué se conserva (creativos, textos, público) y qué se reemplaza (presupuesto y reglas).
