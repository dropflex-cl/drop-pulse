# Referencia visual en el chat

Tarjeta MCP inline, mobile first, con los colores claro/oscuro, tipografía, espaciado, radios y área táctil de `tokens.json`. Muestra la foto completa del producto sin recorte ni transformación. No muestra estados de aprobación del asset.

- Título: «Referencia original del producto».
- Acción principal: «Usar referencia y continuar»; después de subir, «Continuar con la referencia».
- Enlace: «Abrir fotografía original».
- Ayuda inicial: «Usa la foto original para continuar con tu pedido».
- Renovación: «Recuperando la referencia vigente…».
- Durante la subida: «Adjuntando la referencia original…», acción deshabilitada.
- Archivo disponible: «Archivo subido a ChatGPT. Falta comprobar que el generador pueda usarlo».
- Mensaje enviado: «Referencia enviada al chat. Continúa con tu pedido respetando la revisión y aprobación».
- Mensaje fallido: «El archivo está subido. Toca Continuar con la referencia para reintentar el mensaje».
- Sin API de followup: «Archivo subido. Envía en el chat: Revisa la referencia adjunta y continúa con mi pedido».
- Sin APIs de archivo: «Este cliente no permite adjuntar la referencia desde la tarjeta. Abre la original y adjúntala al chat».
- Si cambian los bytes o el contexto durante la subida: «La referencia cambió. Recupera el contexto visual antes de adjuntarla».
- Renovación fallida: «No pudimos renovar la referencia. Recupera el contexto visual y vuelve a intentarlo».

La ayuda y los errores usan `role="status"`. Botón y enlace tienen al menos `size-touch`. Solo un toque inicia la transferencia: renueva URL, verifica identidad y bytes, adjunta y solicita continuar el último pedido en otro turno. El mensaje conserva los límites del usuario, incluido «no generar». Subir al host no confirma entrada al generador. El estado se conserva al remontar; reintentar el mensaje reutiliza el adjunto correspondiente al mismo producto, ID y hash. Cambiar la referencia interrumpe la continuación. La tarjeta no genera ni aprueba imágenes.
