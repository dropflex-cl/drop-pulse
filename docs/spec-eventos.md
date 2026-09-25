# Eventos: capa de branding estacional

Spec de producto (calendario, concepto y fuentes): documento «Spec — Eventos: capa de branding estacional (Q4 2026 Chile)», 2026-09-24. Este archivo es lo implementado.

Un evento (CyberMonday, Halloween, Black Friday, Navidad…) se pone encima de la página del producto **sin tocar su contenido**: cambia el color del botón, suma una barra de aviso, una etiqueta junto al precio con el % real y una cuenta regresiva, y con intensidad total adorna y adapta tres textos. Al terminar se apaga solo y la página vuelve tal cual.

## Datos

Migración `supabase/migrations/20261015000000_events.sql`.

| Tabla | Qué guarda |
|---|---|
| `events` | El calendario de DropFlex por mercado (`market`, hoy solo `CL`), con antesala (`campaign_starts_at`), inicio, término y `priority`. `theme` guarda solo lo que cambia respecto de `EVENT_THEMES[kind]`. Las fechas se editan aquí, sin deploy. |
| `event_activations` | Lo que activa el comerciante. `product_id` null = toda la tienda. `intensity` (`subtle`, `medium`, `full`), `overrides` (`accent`, `announcement`, `badge_label`) y ventana propia opcional. |
| `event_copy` | Textos del evento por producto (IA → el comerciante aprueba). Uno por producto y evento. |
| `product_publications.event_fingerprint` | Huella del evento publicado: si cambia, la app avisa «cambios de eventos sin publicar». |

`event_activations` (por producto) y `event_copy` caen con el producto (`on delete cascade`).

## Reglas (lib/events/resolve.ts, puro y con tests)

1. La activación del producto le gana a la de la tienda para ese evento, también para apagarlo.
2. Solo cuenta lo encendido que no terminó.
3. Si dos eventos se cruzan, se ve el de mayor `priority`. Nunca se mezclan dos temas.
4. Un acento de `overrides` sin contraste AA (`accentCheck`) se ignora.
5. Capas por intensidad (`INTENSITY_LAYERS`):
   - `subtle`: etiqueta y barra.
   - `medium`: además, el color y la cuenta regresiva.
   - `full`: además, los adornos y los textos aprobados.

## Tienda (lib/shopify/components/_event)

- **Metafield de producto** `dropflex.event` (json, en `SHARED_METAFIELDS`). Lleva los 4 eventos más próximos, ordenados por prioridad, con su ventana en segundos Unix y solo las capas encendidas.
  - Es de producto y no de tienda: cada tienda es la landing de un producto y así una activación por producto no necesita otro metafield.
- **Encendido y apagado en el tema, sin cron.**
  - Liquid elige el evento (`df-event-pick`).
  - El navegador vuelve a comprobar la hora y pone `html.df-event-on`, porque Shopify guarda el HTML en caché.
  - `df-event.js` apaga la capa al llegar al término.
- **Dónde se ve:**
  - `layout/theme.liquid`: `df-event-head` va en el `<head>` (color del botón) y `df-event-bar` va sobre el header.
  - `df-price`: `df-event-badge` y `df-event-countdown`.
- **Aviso de tiempo por fase** (`df-event-countdown` + `df-event.js`, igual para todos los eventos):
  - Antesala: `early_label` sin reloj («Precio Cyber adelantado · ya disponible»). Nunca «Empieza en»: contar hasta el inicio invita a esperar. Es honesto porque el precio de la antesala es el mismo del evento.
  - Quedan más de 48 h: «Termina en 3 días», sin segundos.
  - Últimas 48 h: reloj en segundos y color de urgencia (`--df-urgent`).
  - Día del término (hora del comprador): «Último día · termina hoy a las 23:59» y el reloj.
  - Metafields publicados antes traen `countdown_before`: el tema arma «Precio {nombre} ya disponible».
  - `df-subtitle`: la bajada del evento. La de siempre queda en `.df-ev-off`.
- **Por qué no son bloques nuevos:** los templates son del comerciante (`isProtected`), así que un bloque nuevo en `product.json` no llegaría a las tiendas instaladas. Todo entra con «Actualizar tema».
- **Nada inventado:**
  - El % de la etiqueta sale de `compare_at_price` y se actualiza con la variante (`df-price.js`).
  - La cuenta regresiva va a la fecha real del evento, igual para todos.
- **Adornos:** SVG en línea (`df-event-decor`, los mismos trazos que `lib/events/decor.ts`; un test lo compara). No hay archivos que subir.

## Publicar

- **Con el producto:** `runPublish` escribe o borra `dropflex.event` (`publishProductEvent`) y anota la huella.
- **Solo el evento:** en Eventos, «Publicar en la tienda» (`POST /api/events/publish` → `publishEvents`) escribe únicamente el metafield en los productos ya publicados.
  - Pide un segundo toque, porque cambia la tienda real.
  - Se prueba solo en tiendas de desarrollo.
- **Cuándo avisa:** cuando termina un evento, entra el siguiente de la lista y la huella cambia, así que la app pide publicar de nuevo.

## Textos del evento (IA)

- **Qué es:** `lib/events/copy.ts` (prompt, esquema y chequeos) y `startEventCopy`/`runEventCopy` en `lib/events/store.ts`.
  - Es una llamada chica (`effort: low`) con el paso `event_copy` en `AI_STEPS`.
  - Tope de 40 en 24 h.
- **Qué escribe:** tres campos: `announcement`, `subtitle` y `badge_label`.
- **Qué lee y no cambia:** la ficha aprobada, el resumen del cliente ideal, el ángulo principal aprobado y el precio.
  - **Avatar, ángulos y ficha no se modifican.**
  - El texto mantiene el ángulo principal y solo cambia el enfoque.
  - Se guarda aparte: `page_components` no se toca.
- **Chequeos (`eventCopyProblems`):**
  - Sin porcentajes.
  - Montos solo de PRECIO Y OFERTA.
  - Sin palabras internas ni promesas prohibidas.
  - Etiqueta en mayúsculas y sin números.
  - Si falla, se pide una vez más con lo que falló.
- **Decide el comerciante:** aprueba, edita, pide «Proponer otros» o descarta.

## App

- **Rutas:** `/events` (calendario) y `/events/[slug]` (ajustes de la tienda, por producto, textos y vista previa). En Hoy, una tarjeta con el próximo evento.
- **Lecturas:** `lib/data/events.ts`.
- **API:**
  - `/api/events/[slug]/activation` (`PUT`, `DELETE`): las fechas van como `AAAA-MM-DD` en la zona de la tienda, de 00:00 a 23:59:59.
  - `/api/events/[slug]/copy` (`GET`, `POST`, `PUT`, `DELETE`).
  - `/api/events/publish`.
- **Vista previa:** `components/store-preview/event-layer.tsx`, con el mismo marcado que el Liquid y el CSS generado del tema.

## Pendiente

- Probar en una tienda de desarrollo, nunca en una real: «Actualizar tema», publicar y ver la capa en claro, 375 px y escritorio.
- Correr una escritura real de textos del evento. Cuesta dinero, así que va con el OK del comerciante.
- Calendario de otros países: hoy `listEvents` filtra por el país del mercado.
