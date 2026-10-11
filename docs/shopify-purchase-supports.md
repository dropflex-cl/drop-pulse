# Apoyos permanentes y regalo por compra

La ficha muestra siempre Google, las dos tarjetas de envío y guía, el total de reseñas,
el botón de compra, la disponibilidad y el carrusel, en ese orden. Google y las tarjetas
viven en `df-purchase-supports`, renderizado directamente desde `buy-buttons`. Los bloques
existentes de disponibilidad y carrusel se colocan en sus espacios alrededor del botón;
si el editor los quitó, el snippet tiene respaldo. Una experiencia por ángulo no los retira.
Los apoyos permanentes no se pueden apagar desde DropFlex. La línea de entrega también es permanente: exige preparación, tránsito mínimo y máximo y hora de corte antes de publicar. Sin texto aprobado usa el respaldo del bloque con las fechas calculadas desde la logística real.

Las reseñas son las importadas y aprobadas; se publican todos sus textos, sin el antiguo
tope de 30. Las fotos conservan el límite de 90 archivos por publicación. La nota y la cantidad
salen del mismo conjunto completo. `df:reviews:<Shopify product id>` en localStorage guarda
el total, la nota y el orden aleatorio del carrusel. Cada publicación actualiza el total real;
no se generan compras, reseñas ni stock ficticios. Un PDF ausente muestra un
estado pendiente, sin prometer archivos inexistentes. La nota del bloque de Google sigue
el comportamiento generado descrito abajo y es independiente de estas reseñas.

## Asociar una guía real al producto

Al publicar se crean estas definiciones de producto, administradas por el comerciante y
conservadas por las siguientes publicaciones:

| Metafield | Tipo | Uso |
| --- | --- | --- |
| `dropflex.gift_pdf` | Archivo | PDF del regalo. Sin acceso Storefront API. |
| `dropflex.gift_title` | Texto de una línea | Nombre de la guía. Respaldo: «Guía de [producto]». |
| `dropflex.gift_cover` | Archivo | Imagen de portada de la tarjeta; opcional. |

1. Subir el PDF en Shopify → Contenido → Archivos.
2. En el producto → Metafields, seleccionar ese archivo en «DropFlex · PDF de regalo».
3. Asociar el título y la portada. La ficha muestra la tarjeta dinámica; jamás imprime la URL
   del PDF, ni en HTML, atributos, JSON o localStorage.
4. En Shopify → Configuración → Notificaciones → Notificaciones de clientes → Confirmación
   de pedido → Editar código, insertar el contenido de
   `lib/shopify/notifications/order-gift.liquid` antes del pie del correo. Las notificaciones
   no admiten renderizar snippets del tema; hay que insertar ese contenido una vez.
5. Hacer un pedido de prueba con correo. Debe llegar una guía por producto comprado, aunque
   se hayan comprado varias unidades. Un pedido con distintos productos recibe sus propias
   guías. Un producto sin PDF no genera enlaces rotos.

La descarga se entrega con la confirmación del pedido creado: en pago contra entrega no hay
que esperar a `paid`. La notificación debe estar activada y el formulario de EasySell debe
recoger correo y enviar la confirmación del pedido. Un pedido que solo recoge teléfono
requiere conectar la entrega por WhatsApp; este cambio no envía mensajes por WhatsApp.

No hay una nueva copia del PDF en Supabase. Shopify administra el archivo; al borrar el producto
se elimina su asociación por metafield. El archivo de Contenido → Archivos puede ser compartido
por varios productos y sigue bajo control del comerciante. Shopify Files sirve URLs públicas:
el enlace solo se entrega tras comprar, pero quien lo recibe puede compartirlo. Para acceso
revocable por comprador se necesitaría almacenamiento privado y autorización por pedido.

La edición de notificaciones es una configuración de la tienda; actualizar el código del tema
o hacer push a main no instala esa plantilla. La entrega no está activa hasta completar el paso 4.
Variables utilizadas: [referencia oficial de notificaciones](https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables).

## Valoración de Google

El bloque está siempre activo, incluso sin configuración de Google ni reseñas importadas.
`df-google-rating.js` elige una nota entre 4,4 y 5,0 inclusive, en décimas, y guarda el entero
44–50 en `df:google-rating:<Shopify product id>` de localStorage. Todas las apariciones del
producto usan la misma nota, texto y relleno de estrellas; recargar o cambiar de experiencia
la conserva. La nota es generada por el componente: no es una valoración consultada ni
sincronizada con Google. No reemplaza la calificación real de las reseñas del producto.

Sin JavaScript se muestra 4,4. Si el navegador bloquea localStorage, se conserva la nota en
memoria durante la visita; borrar los datos del navegador permite generar otra nota.
La vista previa del editor muestra el respaldo 4,4.

`shop.metafields.dropflex.google_rating` (JSON, PUBLIC_READ) sigue siendo opcional para el
enlace HTTPS y la cantidad real de reseñas de la ficha de la tienda:
`{ "count": 126, "url": "https://..." }`. Su campo `rating` anterior ya no controla la nota.
No se atribuyen a Google las reseñas importadas del producto.

## Alcance de la actualización

Actualizar el tema lleva los snippets, assets y el bloque `buy-buttons` a tiendas instaladas;
conserva sus templates y ajustes. Los bloques anteriores de reseñas y disponibilidad se recolocan
sin duplicarse. Las instalaciones nuevas ya traen la disponibilidad después del botón.
Publicar de nuevo el producto sube todas las reseñas y crea las definiciones del regalo.
