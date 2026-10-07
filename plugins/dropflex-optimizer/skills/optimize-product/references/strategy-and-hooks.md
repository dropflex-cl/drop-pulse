# Persistencia de estrategia y hooks

Consulta los schemas descubiertos del MCP antes de escribir. Usa el modelo existente, sin una máquina de estados paralela.

- Los ángulos guardan `hook`, relaciones a persona/JTBD/pain/facts y `generation_guidance`. Conserva IDs y relaciones al editar.
- Persiste alternativas del chat como `customer_language` con `type: "hook"`, `origin: "synthetic"`, `persona_ref` y `angle_ref`. No las marques como frases observadas de clientes. Una cita auténtica conserva fuente y origen observado.
- Los números de la lista son etiquetas de conversación, no IDs. En otro chat, recupera las alternativas persistidas y muestra sus textos; no supongas qué significaba «el 2» sin la lista original.
- Al elegir, guarda el texto exacto en `Angle.hook` con `patch_product_analysis` o merge de `save_product_analysis`. Para video, guarda texto hablado/pantalla y dirección de apertura en campos admitidos de `generation_guidance` cuando sean parte del pedido.
- `set_product_strategy` selecciona persona, JTBD, pain, ángulo principal, secundarios y oferta; no recibe `primary_hook_id`. Selecciona después de una elección explícita. Si el permiso solo permite draft, guarda draft y explica qué decisión falta.
- La estrategia conserva un snapshot. Si editas el hook de un ángulo seleccionado, revisa `get_product_strategy` y versiona la selección con el contexto actual cuando corresponda. No ejecutes contra una selección stale.
- `landing_hook_id` identifica una ejecución/variante; no es el texto ni una FK a una entidad Hook. Conserva el selector para la misma ejecución; usa otro al conservar una variante distinta para comparar. Respeta los selectores admitidos por el contrato.

| Pedido | Acción |
|---|---|
| «Otros hooks» | Propone y guarda alternativas del ángulo sin elegir automáticamente. |
| «El 2, pero más corto» | Ajusta y persiste la elección inequívoca sin otra confirmación. |
| «Más directo» | Ajusta el contenido señalado, conservando audiencia y oferta. |
| «Cambia de público» | Revisa necesidades, objeciones y ángulos; ofrece una nueva elección si cambia la dirección. |
| «Retoma» | Recupera selección/propuestas y muestra la decisión pendiente. |
| «Ese hook ganó» | Consulta mediciones y límites; una elección no es validación estadística. |

No copies escenas o supuestas expresiones del comprador como hechos. No impongas una forma creativa que contradiga el argumento elegido.
