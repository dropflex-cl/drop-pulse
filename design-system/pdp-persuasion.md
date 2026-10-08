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

## Apoyos de compra por defecto

La ficha conserva estrellas, beneficios de servicio, inventario, entrega, tarjetas de confianza,
reseñas y demostraciones disponibles aunque el recorrido no los incluya como secciones narrativas.
El muro selecciona hasta 12 reseñas aprobadas, con fotos primero, si no tiene una selección propia.
Los mínimos de reseñas, la aprobación del material y las políticas reales siguen siendo obligatorios.
Packs y barra fija de compra están habilitados en el tema y conservan el pack elegido.
La urgencia proviene del inventario de Shopify o de un evento activado con fecha de término real.
La entrega se muestra solo con logística configurada, sin plazos de ejemplo.

Publicar guarda `dropflex.conversion_supports.disabled_components` con los componentes que el
comerciante apagó o rechazó. Estos no reaparecen por usar otra arquitectura. Los autores permanecen
anonimizados; no se generan nombres, recomendaciones personales ni reacciones sociales.

Sin logística, disponibilidad usa «Disponible», «Quedan {qty} unidades» o «Disponible para reservar» según el inventario real. No se generan vendidos ni visitas.
