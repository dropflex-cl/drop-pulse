# Demostraciones del producto

El componente GIFs de la tienda presenta todas las demostraciones en tarjetas consecutivas, una debajo de otra, tanto en móvil como en escritorio. El comprador reconoce un bloque de demostración separado del texto editorial. No se agregan afirmaciones comerciales ni campos al contenido del producto.

- Encabezado: «El producto en acción». El título opcional del editor se conserva.
- Tarjeta: sin borde exterior ni separador bajo la imagen; fondo de acento suave en el título, número «Demostración 01 / 03», título de la pieza, animación y párrafo o lista de beneficios. Se conserva el orden elegido por el comerciante.
- Medios: espacio alrededor de la animación con `--df-gap` (16 px); marco cuadrado uniforme; imagen completa con `object-fit: contain`, sin cortar acciones ni deformar. Las URLs originales conservan la animación. El marco, la imagen y el cuadro pausado usan `--df-radius-media`, el mismo «Radio de las imágenes» que la galería y el resto de la página. La imagen conserva su caja proporcional para que los GIFs verticales también redondeen sus cuatro esquinas. La tarjeta mantiene el radio configurado en Shopify.
- Visibilidad: todas las tarjetas forman parte del flujo de la página desde el inicio. No hay pestañas, flechas, selectores ni paneles ocultos; basta desplazar la página para verlas. Cada tarjeta conserva su altura natural y el orden elegido.
- Movimiento: cada demostración visible se reproduce automáticamente de forma continua, sin corte a los cinco segundos. Al volver a una pieza, al bloque o a la pestaña, se reanuda automáticamente. «Pausar» y «Reproducir» permiten control manual; una pausa elegida por el comprador se conserva. Con movimiento reducido se comienza en un cuadro fijo. Fuera de vista o con la pestaña oculta se congela hasta volver. Si hay varias piezas a la vista, se reproducen todas.
- Escala: espaciado de 8, 12, 16 y 20 px (grilla de cuatro), bordes de 1 px, controles de 44 px, cuerpo de 15 px y títulos de 22–28 px. Tipografía, acento, fondos, tinta, radios y duraciones vienen de los tokens compartidos `--df-*` del tema. No se usan sombras ni colores nuevos.
- Vista previa: mismo marcado, CSS, datos, orden y variantes que Shopify. El marco decorativo de la app muestra el estado inicial.

## Publicación y visibilidad

«Mostrar en la página» de DropFlex gobierna la visibilidad por producto. Cuando el contenido efectivo incluye GIFs seleccionados, publicar habilita únicamente el bloque `df-gif-strip` de la plantilla aplicada y lo incorpora al orden si falta. Conserva ajustes, bloques ajenos y otras secciones ocultas. Un padre oculto o una composición desconocida devuelve un impedimento concreto. Sin archivos o con GIFs oculto en DropFlex no se cambia el template. Guardar/subir archivos no publica ni escribe en el tema.
