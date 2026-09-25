# faq-and-text — Preguntas frecuentes con texto

Sección de página completa: a un lado un texto (antetítulo, título con palabras en acento, bajada, prueba social real y botón opcional) y al otro un acordeón de preguntas con `<details>`/`<summary>` nativos. Archivos: `sections/df-faq-and-text.liquid` + `assets/df-faq-and-text.js` (solo para «una abierta a la vez»). Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

En el tercio inferior de la landing, después de beneficios, reseñas y comparativa y antes del último llamado a comprar. Ahí el comprador ya quiere el producto y solo le quedan dudas concretas; en COD LATAM son pago al recibir, plazo, uso y cambios. Cada duda sin resolver es un «lo pienso y vuelvo», que en tráfico frío equivale a no volver.

## Anatomía

- **Móvil (375 px):** una columna, texto centrado arriba y acordeón abajo. Título de 28 px, preguntas de 16 px, respuestas de 15 px.
- **Escritorio (≥ 990 px):** dos columnas; la de texto (30–50 %, ajustable, 40 % por defecto) queda fija al desplazar y alineada a la izquierda.
- **Texto:** antetítulo (`.df-eyebrow`), título `h2` con las palabras de `heading_highlight` en `--df-accent-ink`, bajada, prueba social (pila de hasta 3 avatares de 44 px superpuestos, estrellas reales, texto con `{rating}`/`{count}` y la fuente de las reseñas) y un botón con el acento.
- **Acordeón:** pregunta en negrita con un signo + que pasa a − (la barra vertical gira y se desvanece); respuesta en `.df-text`.
- **Dos ejes de diseño** (las tres variantes de la referencia): «Tarjeta alrededor» (fondo `--df-surface` y radio que envuelve todo) y «Estilo de preguntas»: divisores (línea de 1 px) o tarjetas (cada pregunta sobre `--df-surface`, o sobre el fondo si ya hay tarjeta alrededor).

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.faq_and_text` (IA) | `eyebrow?`, `heading`, `heading_highlight?`, `body?`, `cta_label?`, `social_proof_text?`, `items[3..8]` (`question`, `answer`, `topic`) |
| Ajustes de la sección | los mismos textos como respaldo, enlace del botón (vacío = página del producto), avatares 1-3, prueba social sí/no, una abierta a la vez, primera abierta, JSON-LD, tarjeta, estilo, ancho del texto, fondo, espacios; producto fuera de la ficha |
| Bloques «Pregunta» (máx. 8) | respaldo del editor: pregunta y respuesta |
| `shop.metafields.dropflex.logistics` (real) | `{min}` y `{max}`: preparación + tránsito |
| `shop.metafields.dropflex.policies` (real) | `{return_days}`, `{warranty_months}` |
| `product.metafields.dropflex.review_summary` (real) | `{rating}`, `{count}`, estrellas y `source_label` visible |

Una pregunta cuyo texto conserva un token sin dato real no se muestra (ni en la página ni en el JSON-LD). La prueba social con un token sin dato se oculta. Sin preguntas válidas la sección no se dibuja (en el editor muestra un aviso).

## Comportamiento

- `<details>`/`<summary>` nativos: teclado, lector de pantalla y búsqueda en la página sin JS. Controles de 44 px de alto como mínimo y foco visible.
- «Una abierta a la vez»: atributo `name` compartido (nativo en navegadores actuales) y `<df-faq-and-text>` como respaldo que cierra las demás de la misma sección.
- La apertura se anima con `::details-content` + `interpolate-size` donde el navegador lo soporta; en el resto abre sin animar. `prefers-reduced-motion` quita la transición.
- «Primera abierta» opcional (la referencia arrancaba todo cerrado).
- JSON-LD `FAQPage` opcional (apagado por defecto para no duplicar el de otra app), con los textos ya reemplazados y serializados con `| json`.
- Con fondo propio oscuro, el texto pasa a blanco y el acento se ajusta a contraste AA contra ese fondo.

## Psicología de venta

- **Objeción:** las dudas residuales antes del clic (pago, plazo, uso, riesgo).
- **Reducción de riesgo:** la pregunta de cambios o garantía cierra la lista, en la posición de mayor recencia.
- **Fluidez cognitiva:** respuestas colapsadas; se escanean las preguntas y se abre solo la que importa.
- **Transparencia:** anticipar las preguntas transmite que la tienda conoce a su cliente.
- **Validación:** el acento en «tus dudas» reconoce al lector.
- **Prueba social ligera:** junto al título, pero solo con el resumen real de reseñas y su fuente visible.

La referencia decía «miles de clientes confían» sin dato y usaba caras ilustradas como clientes; aquí la prueba social sale del resumen real de reseñas y los avatares son del comerciante, con la advertencia de usar solo clientes reales con permiso o ilustraciones que no se hagan pasar por clientes.

## Reglas del copy (IA)

- Título: tranquilidad + «tus dudas/preguntas», 3 a 7 palabras, ≤ 50; `heading_highlight` es 1-2 palabras literales del título.
- Preguntas: como las pensaría el comprador, en primera persona y coloquiales, ≤ 70, terminan en «?».
- Respuestas: la primera frase responde directo («Sí.», «Entre {min} y {max} días hábiles.»), luego el detalle y opcionalmente la red de seguridad; ≤ 280.
- Cobertura mínima `envio`, `uso` y `garantia`; `pago_cod` si la tienda cobra al recibir. Orden: pago, envío, uso, duración, talla, cuidado, diferencial, resultados, garantía.
- **Duración** (`duracion`, «¿Cuánto me dura?»): va siempre que el producto traiga rendimiento o duración. Usa el rendimiento que dio el comerciante y explica los packs como meses de uso («El pack de 3 frascos te alcanza para 3 a 4 meses de rutina»). Es la **única respuesta que puede llevar dígitos**, y solo los de los datos del producto (la app los compara con `key_facts` y `base_info`, `lib/copy/facts.ts`); el esquema de este componente exige el resto sin números.
- **Resultados** (`resultados`): en belleza y bienestar se incluye, condicionado al uso constante y sin plazo.
- Prueba social solo con `{rating}`/`{count}`.
- **Prohibido:** escribir plazos, días, costos o cantidades (van como tokens; la excepción es el rendimiento en la respuesta de duración); inventar el rendimiento o prometer resultados en un plazo; claims de salud; «el mejor», «100 % garantizado», «certificado»; inventar materiales o cuidados; presentar la garantía legal como beneficio extra (Ley 19.496 arts. 28 y 33).
