# Contenido preparado desde el chat

La decisión del comerciante sustituye las acciones de redacción pagada de las pantallas de ejemplo históricas. Se reutilizan Notice, EmptyState, Button, campos, StatusBadge y StickyActions con sus tokens y comportamiento existentes. Los textos guardados siguen disponibles para revisar, editar y publicar. Los proveedores conservan el render y el QA visual opcional.

## Textos vigentes

| Pantalla | Título/acción | Explicación |
|---|---|---|
| Estrategia | Define la estrategia desde el chat | Guarda el análisis con save_product_analysis y selecciona la estrategia con set_product_strategy. Elegir un ángulo no demuestra que sea ganador. |
| Estrategia sin selección | Prepara tu estrategia en el chat | Cuando guardes la selección, podrás consultarla aquí. El informe anterior conserva su contenido para revisión. |
| Estrategia seleccionada | Estrategia seleccionada | Se muestran posicionamiento, justificación y ángulos de la selección canónica. |
| Estrategia desactualizada | Revisa la estrategia en el chat | Cambió el contexto o la evidencia. Recupera la selección y resuelve lo pendiente antes de generar contenido. |
| Estrategia, acciones | Actualizar / Continuar: Imágenes / Consultar informe anterior | Actualizar relee; continuar navega; el informe anterior es de consulta. |
| Datos del producto | Datos del producto | Completa el nombre y la descripción. Revisa que describan lo que el producto hace. |
| Información base incompleta | Continuar: Estrategia | Completa el nombre y la descripción del producto. |
| Contexto incompleto | Completa el contexto del producto / Ir a Información base | Conserva el motivo comprobado de datos o precio faltantes. |
| Landing vacía | Escribe tu página desde el chat | Envía los textos con save_landing_content. Aquí podrás revisar la ficha, elegir componentes y aprobar la página antes de publicarla. |
| Landing sin ficha | Falta la ficha del producto. | Escríbela en el chat y envíala con save_landing_content. |
| Landing desactualizada | Cambió el contexto de tu producto. | Recupera el contexto en el chat, revisa el contenido y envía los cambios con save_landing_content. Después apruébalos aquí. |
| Landing anterior fallida | La escritura anterior no terminó. | El contenido guardado sigue disponible. Prepara los cambios en el chat y envíalos con save_landing_content. |
| Imágenes sin tomas | Prepara las tomas en el chat | El director automático se retiró. Puedes subir imágenes, elegir fotos de Información base y generar las tomas que ya están guardadas. |
| Imágenes desactualizadas | Cambiaron los beneficios de tu página. | Revisa el plan de imágenes en el chat antes de generar más tomas. |
| Creativos sin conceptos | Prepara tus anuncios en el chat | La propuesta automática se retiró. Aquí podrás revisar y renderizar los conceptos guardados. |
| Conversación creativa inexistente | Prepara la conversación en el chat. | Aquí podrás revisar y renderizar las conversaciones guardadas. |
| Eventos | Prepara los textos del evento en el chat | La redacción automática se retiró. El evento conserva sus textos por defecto y puedes revisar los textos que ya están guardados. |
| Consejo WhatsApp sin contenido | Prepara el consejo de uso en el chat con información comprobada del producto. | La redacción automática se retiró. |
| Ajustes, mercado | Dónde vendes | El contexto del producto usa este idioma y los precios se calculan en esta moneda, con pago contra entrega. |
| Ajustes, Anthropic | Inteligencia artificial | Tu cuenta de Anthropic (Claude) se usa solo al activar la revisión de imágenes. Los textos se preparan desde el chat. |
| Anthropic conectado | Revisión de imágenes | La revisión opcional de imágenes usa tu cuenta y tu saldo de Anthropic. El costo de cada producto aparece en su pantalla. |
| Anthropic desconectado | Conectar | Pega tu clave de Anthropic si quieres activar la revisión de imágenes. Los textos se preparan desde el chat; esta revisión se cobra de tu saldo de Anthropic. |

Las tools de ingestión ya están implementadas. Guardar crea propuestas; el comerciante conserva la revisión y publicación.

## Textos del cierre de ingestión

- Datos base: «Completa los datos y el precio. Prepara la estrategia desde el chat.»
- Contexto del proveedor: «Pega la descripción del proveedor, medidas, materiales, reseñas o lo que te hayan preguntado tus clientes. Usa esta información como contexto para el chat.» El detector local muestra «temas detectados», sin atribuirlo a IA.
- Precio y packs: «El chat usa este precio y estos packs al preparar la estrategia y el contenido.» / «Describe qué incluye cada pack. Usa una duración solo si está comprobada en los datos del producto.»
- Reseñas: «Opcional. Úsalas como evidencia en el chat.»
- Galería: «Guarda el plan con save_gallery_content. Puedes generar sus imágenes desde el chat con generate_gallery_images o revisarlo y generarlas aquí.»
- Creativos: «Guarda los conceptos y las conversaciones con save_creative_content. Aquí podrás revisarlos y generar sus imágenes.»
- Eventos: «Guarda los textos con save_event_content. El evento conserva sus textos por defecto hasta que revises y apruebes la propuesta.»
- WhatsApp: «Prepara el consejo con información comprobada del producto y guárdalo con save_usage_tip. Revísalo aquí antes de usarlo.»
- Consejo pendiente: StatusBadge «Revisión», acción «Aprobar consejo», toast «Consejo aprobado». Error «No pudimos aprobar el consejo.»; la respuesta del servidor explica conflictos o evidencia inválida.
- Fuente del consejo: «Consejo guardado · fuente: {basis}».

Los avisos conservan los títulos de la tabla histórica. Los campos de datos base no guardan sobre una edición posterior: «Los datos del producto cambiaron desde tu lectura. Actualiza la página antes de guardar.»

- Datos guardados desde el servicio compartido: «Contexto guardado». La etiqueta solo aparece cuando hay nombre y descripción. La navegación canónica muestra «Estrategia seleccionada» o «Revisa la estrategia en el chat», sin exigir dos ángulos si la selección válida tiene uno.
