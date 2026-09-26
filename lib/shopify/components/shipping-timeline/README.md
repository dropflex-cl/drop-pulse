# shipping-timeline — Envío

Bloque de la columna del producto: una línea «Pide dentro de 3 h 05 min y sale hoy» y tres hitos (Pedido → Despachado → Entregado) con fechas reales, unidos por una línea punteada en movimiento. Archivo: `blocks/df-shipping-timeline.liquid` + `assets/df-shipping-timeline.js`. Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Bajo el botón de compra. Es el reaseguro para quien duda con el dedo sobre el botón: convierte «envío rápido» en fechas concretas y suma un plazo de corte real («si pides dentro de…»). Complementa a `inventory` (entre precio y botón), que ya dice el plazo en días.

## Anatomía

Igual en móvil y escritorio:

1. **Título** (opcional), centrado, 14 px: el tiempo en negrita con el acento del producto (o verde, ajuste). Se reserva su línea hasta que el JS lo llena.
2. **Tres hitos** en una grilla de 3 columnas (`<ol>`): círculo de 56 px (60 px en escritorio) con ícono de línea (`cart`, `truck`, `package`) o imagen propia; etiqueta 13 px semibold; subtexto 12 px atenuado (hito 1: «Hoy»; hito 2: día de despacho; hito 3: rango de entrega y, opcional, una nota como «pagas al recibir»).
3. **Conector punteado** detrás de los círculos, del centro del primero al centro del último; sus trazos avanzan hacia la derecha.

Círculos neutros (`--df-surface`) o con el acento suave (`--df-accent-soft` + `--df-accent-ink`).

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.shipping_timeline` (IA) | `countdown_template`, `closed_template?`, `node_ordered_label`, `node_ordered_sub`, `node_shipped_label`, `node_delivered_label`, `node_delivered_sub_suffix?` |
| Ajustes del bloque | los mismos textos como respaldo (campo a campo); logística de respaldo; mostrar contador, fecha del hito 2, formato de fecha, color del contador, estilo de círculos, íconos propios, línea animada, márgenes |
| `shop.metafields.dropflex.logistics` (real) | `handling_days`, `transit_days_min`, `transit_days_max`, `cutoff_hour`, `timezone`, `business_days_only`, `saturday_delivery`, `holidays` |
| Navegador (real) | la hora actual, convertida a la zona de la tienda |

Tokens: `{time}` (tiempo hasta el corte, «3 h 05 min»), `{arrive}` (primer día de entrega en la ciudad principal, con artículo: «mañana», «el martes») y `{ship}` (día de despacho: «hoy», «mañana», «el viernes», «el 26 sept»). El título habla de la llegada: a quien compra le importa cuándo lo tiene, no cuándo sale; «despachamos el martes» sonaba lejano aunque llegara el miércoles.

## Comportamiento

- **Todo se calcula en el navegador** (la página puede venir cacheada). Liquid deja la logística en un `<script type="application/json">` y un texto sin JS («2 a 6 días hábiles») que el JS reemplaza por fechas.
- **Fechas de calendario, no timestamps:** cada día es un entero; sumar uno es «mañana» aunque ese día cambie el horario (Chile cambia en abril y septiembre). Solo la cuenta regresiva convierte día + hora de la tienda a un instante, resolviendo la hora inexistente del cambio de horario.
- **Algoritmo** (funciones puras al inicio del JS):
  - día del pedido = hoy; pasado el corte, mañana; y luego el siguiente día hábil (sin feriados y, en modo hábil, sin fin de semana).
  - despacho = pedido + días de preparación hábiles (0 = el mismo día).
  - entrega = despacho + tránsito mínimo … despacho + tránsito máximo, contando días de reparto (nunca domingo ni feriado; sábado solo si el courier reparte). Un solo modelo, sin el «colchón» doble de la referencia.
  - corte = la hora de corte del día del pedido; con corte 0, la medianoche que lo cierra.
- **Cuenta regresiva viva**, refrescada al cambio de cada minuto (no cada segundo) y al volver a la pestaña; al vencer recalcula: el despacho pasa al siguiente día hábil. Solo se muestra si el corte llega dentro de 24 h; si no (fin de semana, feriado, pasado el corte del viernes) usa el texto sin contador («Pide hoy y lo despachamos el lunes») o se oculta. Nunca un contador sin corte real.
- Fechas en el idioma de la tienda (`es-CL`): «hoy», «mañana», el día de la semana si cae esta semana (o siempre día y mes, ajuste), rangos «30 de sept al 3 de oct».
- Accesibilidad: `<ol>` de tres `<li>`, íconos `aria-hidden`, textos de 12 px o más; el contador no está en `aria-live` (cambiaría cada minuto) y un resumen oculto dice «Entrega estimada entre el 30 de septiembre y el 3 de octubre». `prefers-reduced-motion` detiene la línea.
- Varias instancias: cada una lee solo su propio JSON. Sin fetch ni dependencias.

## Psicología de venta

- **Objeción:** «¿cuándo me llega?» (la primera en pago contra entrega, por el miedo a esperas de semanas) y «lo compro después».
- **Especificidad y *future pacing*:** una fecha concreta hace imaginar el día en que se tiene el producto.
- **Urgencia legítima:** el corte es real; pedir después cuesta un día. Aversión a la pérdida sin mentir.
- **Fluidez:** tres pasos e íconos universales, un vistazo.
- **Proceso visible:** la línea en marcha señala una operación profesional y baja el riesgo percibido de una tienda desconocida.
- **Compromiso:** «Pedido · Hoy» ya pone al comprador en el paso 1.

La referencia calculaba una sola vez (el contador no avanzaba), con la hora del navegador en vez de la de la tienda, fechas en inglés, sin feriados, con un nombre de ajuste invertido para los fines de semana y un «colchón» sumado dos veces. Aquí: hora de la tienda, contador vivo, feriados y días hábiles, un solo modelo de plazos.

## Reglas del copy (IA)

- `countdown_template`: «[verbo imperativo] dentro de {time} y recíbelo desde {arrive}», ≤ 50 caracteres, `{time}` obligatorio. `{arrive}` siempre con «desde» (es el primer día posible). `{ship}` solo como dato secundario.
- `closed_template`: invitación sin urgencia con `{arrive}`, ≤ 50.
- Etiquetas: 1-2 palabras en secuencia (≤ 12; el hito 3 ≤ 14). `node_delivered_sub_suffix` (≤ 20): refuerzo del pago contra entrega, solo si está activo.
- Tuteo, sin emojis, sin exclamaciones en las etiquetas.
- **Prohibido:** escribir horas, días o fechas (el esquema rechaza dígitos); «entrega garantizada mañana» o «envío express» si no es el servicio real; contadores sin corte real (Ley 19.496, arts. 12 y 28).

## Despacho los sábados y plazo de regiones

Ajustes › Envíos y políticas, publicado en `dropflex.logistics`:

- **`saturday_dispatch`:** con «solo días hábiles», el sábado cuenta para preparar y despachar; el domingo nunca. Pedido antes del corte (ej.: 9 h) con 0 días de preparación: sale el mismo día; después, el siguiente día de despacho.
- **`main_city` + `regions_extra_days`:** el tránsito rige en esa ciudad y el resto del país suma esos días de entrega. El hito «En tu puerta» muestra dos fechas: «Santiago: 26 sept» y «Regiones: 29 – 30 sept» (texto del ajuste `regions_label`). `transit_days_max` ya viene con el plazo de regiones, así que los demás componentes («llega en {min} a {max} días») son verdad en todo el país; la línea de tiempo usa `main_city_transit_max` para la ciudad.

## Logística de respaldo

Solo si la tienda no tiene `dropflex.logistics`: corte 9 h, preparación 0 días, tránsito 1 a 3 días en Santiago, regiones +2, despacho los sábados, reparto sin sábado. Es el perfil de pago contra entrega en Chile; el de antes (corte 14, 1 + 2 a 5 días, sin sábado) daba «despachamos el martes · 1 – 6 de oct» a un pedido del sábado. El corte de respaldo es el más temprano razonable: con uno más tarde, el contador prometería «sale hoy» a pedidos que ya no salen.
