# Producción visual

Se integra en Imágenes y muestra la identidad también en Información base. No agrega etapas ni bloquea el contenido ya generado por falta de clave de IA.

Tres vistas: **Identidad**, **Plan**, **Piezas**. Encabezado: «Producción visual». Ayuda: «Prepara las imágenes desde tu chat conectado. Revisa aquí la identidad, las tomas y sus usos».

Estados mediante `StatusBadge`. Vigencia en un `Notice` independiente: «Revisa el cambio», con la dependencia afectada. Archivo es una acción reversible; no se representa como publicación. Selección es un uso de una pieza aprobada, no una aprobación nueva.

Identidad: referencia, descripción, «Conserva», «Puede variar», «Evita». Acciones «Editar identidad», «Guardar propuesta», «Aprobar», «Descartar», «Archivar», «Volver a revisar».

Plan: intención, familia, prioridad, ángulo, trabajo persuasivo, escena, composición y restricciones heredadas. Acciones «Editar toma», «Revisar cambios», «Guardar propuesta», «Aprobar», «Copiar brief», «Subir resultado». Nunca muestra un editor de JSON ni claves de un proveedor.

Piezas: preview, aprobación, vigencia, versión de identidad, origen, fecha, feedback, usos seleccionados y propuestos. Acciones «Comparar», «Ver historial», «Proponer uso», «Usar aquí», «Quitar uso», «Pedir otra versión». Rechazar permite agregar un motivo en línea sin diálogo de confirmación. Las revisiones de vigencia exigen explicar por qué se conserva la imagen. La acción «Pedir otra versión» copia una solicitud para el chat, sin iniciar generación en el servidor.

Etiquetas de feedback: «Forma incorrecta», «Color incorrecto», «Poco creíble», «Demasiada suciedad», «Composición», «Texto», «Fidelidad al producto», «Buena fidelidad», «Buena demostración», «Buena composición».

Se reutilizan espaciado, tamaños, radios y tipografía de `tokens.json`, `Field`, `Button`, `Notice`, `SegmentedControl` y `StatusBadge`. Controles de al menos `size-touch`. Error persistente con `role="alert"`; progreso de ingestión con `role="status"`. Una acción principal por vista. Historial y comparaciones en detalles expandibles, con una grilla que se apila en móvil.
