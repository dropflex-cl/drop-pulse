# shipping-timeline — Despacho y entrega

Ticket después del botón de compra existente y su línea de confianza: titular, contador del próximo corte con horas, minutos y segundos reales, paquete ilustrativo y dos fechas estimadas. Debajo, benefit-double-box destaca COD con cero adelanto. El precio principal permanece junto al título y protagoniza la oferta antes del despacho; el ticket no añade precio ni otro CTA. Su diseño y animación se conservan. Colores derivados exclusivamente de `--df-accent`, `--df-accent-ink`, `--df-on-accent` y `--df-accent-soft`; la línea mezcla el accent con el fondo. Los ajustes antiguos `time_color` e `icon_style` siguen en el schema por compatibilidad, pero no sustituyen el accent.

La presentación compacta mantiene todos los datos y textos: titular de 20 px, cifras de 24 px y ruta ilustrada de 96 px, con caja de 72 × 56 px y padding reducido. Reduce la superficie del ticket para dejar la jerarquía al precio y botón. El CSS canónico genera la misma composición en React; logística, contratos y runtime del despacho no cambian.

## Contenido vigente y compatibilidad

Contrato canónico: [content.ts](content.ts). Los nuevos campos son opcionales:

- `heading`: titular del ticket, 8–60 caracteres sin cifras ni tokens; respaldo «Que el próximo lleve el tuyo».
- `parcel_label`: etiqueta del paquete, 3–20 caracteres sin cifras ni tokens; respaldo «Tu pedido».
- `countdown_label`: etiqueta sobre el contador, 3–40 caracteres.
- `arrival_template`: 12–60 caracteres; incluye `{arrive}` y usa «desde» para indicar la primera fecha posible.
- `cutoff_template`: 12–60 caracteres; incluye `{cutoff}`, día y hora locales del próximo corte.
- `dispatch_template`: 12–60 caracteres; incluye `{ship}` para el despacho estimado.

Todos rechazan cifras escritas y tokens ajenos a su campo. Fechas, cifras del contador y fechas se calculan con la logística; la IA no los inventa. Defaults del bloque: «Próximo despacho», «Recíbelo desde {arrive}», «Confirma antes de {cutoff}», «Despacho estimado: {ship}».

`countdown_template`, `closed_template` y los campos `node_*` se conservan para clientes y contenido anterior. No se recuperan variantes descartadas, selecciones, archivos o secciones ocultas. La frase legacy se conserva como texto accesible; las tres columnas dejan de mostrarse. La nota de pago `node_delivered_sub_suffix` permanece guardada, pero el reaseguro lo presenta `benefit-double-box`, sin duplicación visual.

El contrato se descubre desde `get_component_catalog`, `get_landing_content` y `get_component_generation_context`; `save_landing_content` valida y persiste el mismo contenido vigente. `get_pdp_completion_report` mantiene completos los contenidos anteriores porque los nuevos campos son opcionales. El payload `dropflex.shipping_timeline` y la vista previa leen esa misma variante.

## Datos reales

`shop.metafields.dropflex.logistics`: preparación, tránsito mínimo y máximo, corte, zona IANA, feriados, días hábiles, despacho y reparto en sábado, ciudad principal, tránsito máximo de esa ciudad y días extra a regiones. Publicar requiere logística completa; no se sustituyen datos operativos con el ejemplo del editor.

El reloj del navegador se convierte a la zona de la tienda. El algoritmo usa días de calendario, salta días de cierre y feriados y resuelve DST al convertir el corte en un instante. Pasado el corte, recalcula el siguiente día operativo, despacho y entrega. No promete que el retraso sea siempre un día natural.

`{time}` expresa tiempo restante; `{arrive}` primera llegada posible con artículo; `{ship}` despacho estimado; `{cutoff}` día y hora del cierre de pedidos. Con corte cero, el plazo se indica como medianoche del siguiente día. Rangos y etiquetas de destinos siguen visibles: la primera llegada no representa una fecha universal para regiones. Las plantillas separan su etiqueta del token de fecha; la frase completa se conserva como texto accesible. El componente no lee una dirección del formulario ni inventa una geolocalización.

Cuenta regresiva solo si existe plantilla con `{time}` y faltan hasta 24 horas. Fuera de esa ventana se conservan las fechas y los rangos sin urgencia. Se actualiza cada segundo mientras el corte está dentro de 24 horas; fuera de esa ventana, cada minuto. Recalcula al vencer y al volver a la pestaña, sin reinicio artificial. La pestaña oculta cancela el temporizador; no anuncia ni anima cada segundo; conserva el fundido breve al cambiar el minuto. Sin JS se muestran plazos operativos y el contador queda oculto.

## Movimiento y accesibilidad

Un recorrido de 2,6 s derivado de tokens (`reveal × 5 + base`): paquete (`translate`, `rotate`, `scale`), línea (`scale`) y fechas (`translate`). Una vez al estar al 50 % visible, solo si estaba bajo el pliegue. No representa un pedido ya hecho ni tracking. Se detiene con hover, foco, pestaña oculta, salida de pantalla, resize y desconexión. Movimiento reducido, tema con `df_motion=off` y editor dejan el estado estático. Ningún bucle, dependencia o solicitud de red.

El dibujo es decorativo; el titular, corte y rangos contienen la misma información como texto. El contador no tiene `aria-live` para evitar anuncios cada segundo. Texto mínimo de 12 px y accent con el contraste que proporciona `df-accent-vars`.

React usa el mismo marcado/CSS y carga el asset canónico del reloj y la animación desde `/store-preview/df-shipping-timeline.js`, copiado por `npm run shopify:components`. La logística del preview conserva zona horaria y feriados del payload efectivo.
