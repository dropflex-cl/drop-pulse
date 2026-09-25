# Eventos en la tienda

Capa de branding estacional (Cyber, Black Friday, Navidad…) sobre la ficha del producto. Spec: [`docs/spec-eventos.md`](../../../../docs/spec-eventos.md). No es un componente del catálogo: la IA no escribe aquí, todo sale del metafield `dropflex.event` que publica DropFlex (`lib/events/resolve.ts › EventMetafield`).

| Pieza | Dónde | Qué hace |
|---|---|---|
| `snippets/df-event-pick.liquid` | Lo usan todas | Imprime la posición del evento que se ve ahora: el que está dentro de su ventana o, si ninguno, el que empieza en las próximas 24 h. |
| `snippets/df-event-head.liquid` | `layout/theme.liquid`, en el `<head>` después de `df-design-system` | Pone `df-event-on` en `<html>` si la hora del navegador está en la ventana. Con capa de color, el botón y el foco toman el acento del evento. |
| `snippets/df-event-bar.liquid` | `layout/theme.liquid`, sobre el header | Barra de aviso con los colores del evento (y adornos con intensidad total). |
| `snippets/df-event-badge.liquid` | Dentro de `df-price` | Etiqueta del evento con el % de ahorro **real** de la variante (`compare_at_price`); `df-price.js` lo cambia con la variante. |
| `snippets/df-event-countdown.liquid` + `assets/df-event.js` | Dentro de `df-price` | Cuenta regresiva hasta la fecha real (inicio en la antesala, término durante). Al llegar a cero quita `df-event-on`. |
| `snippets/df-event-decor.liquid` | Barra y etiqueta | Adorno SVG en línea, con el color del texto. Mismos trazos que `lib/events/decor.ts` (test). |

Reglas:

- Lo del evento lleva `df-ev-only` y lo que reemplaza lleva `df-ev-off` (la bajada en `df-subtitle`). La regla está en `_shared/assets/df-components.css`: sin `df-event-on` no se ve nada del evento. Así una página en caché nunca muestra un evento terminado.
- Todo texto del metafield se imprime con `| escape`. Los colores pasan por `color_to_hex`.
- Nada de bloques nuevos en `templates/product.json`, porque son del comerciante y no se actualizan. La capa entra por el layout y por los bloques `df-*` existentes con «Actualizar tema».
