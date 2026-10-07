# Recorrido de la página

Extensión de Página del producto, visible solo para productos habilitados. Usa los tokens y componentes actuales, sin nueva etapa.

- Título: «Recorrido de la página».
- Vacío: «Planifica el recorrido en el chat», «Elige una estrategia y un ángulo. Guarda el plan antes de decidir qué bloques aparecen.»
- Selector: «Elige un plan», «Elige una experiencia».
- Acciones: «Aprueba el plan», «Crea una experiencia», «Guarda el recorrido», «Activa la experiencia», «Archiva la experiencia», «Crea una variante», «Revisa la vista móvil».
- Orden: «Sube la sección», «Baja la sección». Deshabilitar: «Usa esta sección».
- Campos: «Componente», «Variante de contenido», «Nombre de la variante».
- Ayuda: «Editar textos e imágenes conserva el plan. Cambia el argumento en el chat cuando necesites otro recorrido.»
- Publicación: «Activar prepara la experiencia. Publica desde la etapa Publicar para cambiar la tienda.»
- Error: «No pudimos guardar el recorrido. Recupera el contexto e intenta de nuevo.»
- Toast: «Recorrido guardado», «Plan aprobado».
- Lista del argumento: creencia actual → creencia objetivo; una idea por bloque y su razón de existir. Los errores quedan visibles con Notice, nunca solo en toast.
- Los estados del plan/experiencia se traducen a StatusBadge: draft=generado, review=revision, approved/active=aprobado, archived=rechazado. «Active» significa preparado para publicación; la UI no lo presenta como publicado.
- Reordenar usa botones accesibles de al menos size-touch. La ficha comercial y sus apoyos quedan antes del cuerpo, según capacidades del runtime. La previsualización móvil usa StoreFrame y los componentes existentes.
## Recuperación y default

- «Usa como recorrido predeterminado»: el fallback de producto; se activa/publica junto a la experiencia.
- «Recupera el recorrido»: ante conflicto, cargar la última versión persistida.
- «Recuperar carga la última versión guardada.»: explica la sustitución del borrador local.
- «El recorrido ya no está habilitado. Actualiza la página.»: un producto deshabilitado durante la edición.
- «No pudimos recuperar el recorrido. Intenta de nuevo.»: recuperación fallida.
