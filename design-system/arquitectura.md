# Arquitectura y navegación

El contenido guardado desde MCP está disponible sin aprobaciones separadas. UI y MCP editan el mismo contenido vigente; cambiar estrategia o contexto conserva textos, medios y usos. Mostrar/ocultar, selección, destino y orden son decisiones explícitas. Los planes e historial son información secundaria. Variantes por ángulo/hook son alternativas comerciales, no revisiones a administrar. Vista previa y publicación usan `effectivePage`/`preparePublish` y solo presentan impedimentos concretos. Ver `docs/product-intelligence/current-content.md` para las reglas operativas vigentes.


La app representa el contenido guardado desde el chat y permite operar la tienda. El producto abre siempre en su ficha, incluso si todavía no tiene página. Generar y aprobar etapas ya no organiza la navegación.

## Mapa implementado

```
Onboarding → Shopify → Productos → Números → Meta Ads opcional → Listo
Hoy             Publicaciones listas, cambios sin publicar, errores y decisiones de campañas
Productos       Guardados · Con error · Publicados; Upsell al pie
  Producto      Identidad, situación, vista previa, oferta y herramientas
    Información y oferta   Datos guardados, calculadora y packs
    Página                 Textos, visibilidad, imágenes, versiones, orden y color
      Imágenes             Portada y galería; archivos existentes y carga manual
    Publicación            Resultado, requisitos y contenido; tema desplegable
    Herramientas           Creativos, anuncios, reseñas y WhatsApp
Campañas        Decisiones y métricas reales
Eventos         Contenido y ofertas de fechas comerciales
Ajustes         Conexiones, proveedores, mercado, envíos y políticas
```

## Producto y decisiones

Cuatro accesos sin bloqueo: **Producto**, **Información y oferta**, **Página**, **Publicación**. En móvil se desliza la navegación horizontal con controles de al menos `size-touch`; escritorio mantiene los mismos destinos. El encabezado compartido conserva identidad, miniatura, costo y asistente.

La ficha muestra primero la situación y la vista previa. Oferta, estrategia y herramientas secundarias se consultan cuando se necesitan. En escritorio el resumen y la página quedan al lado; en móvil la página precede las herramientas. Ninguna sección vacía se transforma en tarea de revisión.

No hay medidor, lista de nueve etapas ni «Continuar» calculado por aprobaciones. Los nombres internos de etapas permanecen donde identifican rutas compatibles, costos o ejemplos del catálogo de diseño.

El contenido válido del MCP se guarda aprobado. Publicar requiere otra acción y su permiso operativo. Una nueva propuesta conserva los textos editados, los descartes y las secciones ocultas. El comerciante puede recuperar explícitamente el texto del chat, editar, ocultar, ordenar imágenes y cambiar la versión principal.

Ficha, editor y Publicación usan la misma preparación. Una experiencia activa manda en la variante, el orden y las secciones. Las visitas resuelven gancho exacto, ángulo y principal, igual que Shopify. Sin experiencia activa se representa contenido nativo vigente; no se genera una página de respaldo.

Portada y galería se eligen tocando. La primera es Portada. Mantener presionado permite moverlas; los botones y el teclado ofrecen otra forma de ordenar. Solo una portada disponible es obligatoria: no hay mínimo de cuatro fotos ni de secciones adicionales. La selección se guarda atómicamente y comprueba la versión leída.

## Situaciones reales

| Situación | Qué comunica | Acción |
|---|---|---|
| Sin contenido | Sin página guardada | Preparar en el chat o ajustar información |
| Parcial | Contenido visible y requisitos concretos | Resolver el dato o archivo faltante |
| Listo | Cumple requisitos de contenido | Publicar en mi tienda |
| Publicando | Operación en curso | Consultar progreso; se puede salir |
| Publicado | Fecha y enlace de publicación | Ver publicación o tienda |
| Actualizado | Cambios guardados por categoría | Publicar cambios |
| Error | Qué pasó y cómo reintentar | Abrir Publicación |

Los siete estados de ciclo de vida siguen usando `StatusBadge`. Vacío e incompleto no inventan aprobaciones pendientes. Shopify y Meta conservan sus estados reales: aprobación no implica publicación, inventario o campaña activa.

Hoy incluye acciones concretas: contenido listo, cambios guardados, publicación fallida y campañas. Productos vacíos o parciales no añaden revisiones al contador. Publicados incluye los productos con cambios posteriores, porque su versión anterior sigue en la tienda. Upsell sigue separado y excluido de Hoy.

## Herramientas y compatibilidad

Las URL siguen en inglés. `/products/[id]` es la ficha; `/base`, `/copy`, `/images` y `/publish` conservan funciones. `/angles` consulta estrategia. `/reviews`, `/creatives`, `/ads` y `/whatsapp` son herramientas comerciales. Las rutas antiguas en español y Precio conservan las redirecciones existentes.

Importar reseñas necesita una decisión propia: importación no equivale a contenido guardado por MCP. Se mantienen autor, calificación, original y fotos; sin país ni origen visibles en la tienda. Los creativos guardados siguen disponibles. Crear un archivo de un plan existente requiere el proveedor del comerciante. Campañas conserva veredicto, razón, cifras y acción.

Publicación presenta resultado y requisitos antes del tema. Instalar/publicar el tema es configuración de tienda, consultable aparte. Se comprueban precio, ficha válida, portada, plazos y archivos usados; no un recorrido ni aprobaciones redundantes. Si hay versiones activas sin página principal, se pide elegir cuál reciben las visitas directas. Componentes fuera de las experiencias activas no exigen medios ni se suben como parte de la página.

Precio conserva `PriceBreakdown`, costo, precio, tachado, supuestos y packs. Métricas e inventario vienen de sus sistemas operativos. No se fabrican reseñas de Google, regalos o escasez para llenar el preview.

Se mantienen tokens de `tokens.json`, contraste en claro y oscuro, foco, áreas táctiles, movimiento reducido y `pb-safe`. Detalles técnicos y trazas no ocupan la experiencia principal.
