# comparison-table — Tabla comparativa

Sección de página completa: «[Producto] vs. [categoría genérica]» con la columna nuestra como un pilar del color de acento que atraviesa la tabla. Archivos: `sections/df-comparison-table.liquid`, `snippets/df-comparison-table-cell.liquid` y `assets/df-comparison-table.js` (solo para el latido opcional). Contrato: [`content.ts`](content.ts).

## Dónde va y por qué

Segunda mitad de la landing, después de beneficios y antes de reseñas o FAQ. El comprador ya entendió el producto y piensa «¿no lo encuentro igual o más barato en otro lado?». La tabla responde esa comparación dentro de la página, antes de que salga a buscarla.

## Anatomía

- Título centrado (opcionalmente en cursiva).
- `<table>` real con `table-layout: fixed`:
  - Cabecera: celda vacía (con «Característica» oculto para lectores), nuestra columna (logo o nombre) sobre el acento con esquinas superiores redondeadas, y 1 o 2 competidores en texto atenuado.
  - Filas: característica (`<th scope="row">`, semibold, alineada a la izquierda), nuestro valor y el de cada competidor. Divisor de 1 px entre filas.
  - Nuestra columna es un bloque continuo `--df-accent` con texto e íconos `--df-on-accent`; la última celda baja 14 px más con esquinas inferiores redondeadas (el «pilar»).
- Valores: Sí (`check-circle`), No (`x-circle`, atenuado o `--df-negative` con «Cruces en rojo»), Parcial (círculo medio relleno dibujado en CSS) o un texto corto. Cada ícono lleva su texto oculto («Sí», «No», «Parcial»).
- Leyenda «Parcial: solo en algunos casos o modelos» cuando aparece algún parcial, y la nota al pie.
- Móvil (375 px) con 1 competidor: 44 / 28 / 28 %, texto de 14 px, sin desplazamiento. Con 2 competidores: la tabla mide al menos 540 px, se desplaza en horizontal (región enfocable con nombre) y la columna de características queda fija con una sombra que indica el desplazamiento.

## Datos

| Origen | Qué |
|---|---|
| Metafield `dropflex.comparison_table` (IA, aprobado) | `heading`, `us_label`, `other_labels[1..2]`, `rows[4..6]` (`feature`, `us`, `others[]`, `basis`), `footnote?` |
| Ajustes de la sección | título, nombre y logo de nuestra columna, competidores 1 y 2, nota al pie, cursiva, cruces en rojo, latido, fondo, espacios; producto fuera de la ficha |
| Bloques «Fila» (máx. 8) | respaldo del editor: característica, valor y texto para nosotros y cada competidor |
| `shop.metafields.dropflex.logistics` (real) | `handling_days` + `transit_days_min/max` → `{min}` y `{max}` |
| `shop.metafields.dropflex.policies` (real) | `return_days` → `{return_days}`, `warranty_months` → `{warranty_months}` |
| App (real) | la aprobación del comerciante: el metafield solo se publica con `approved_by_merchant` |

Una fila cuyo texto conserva un token sin dato real no se muestra. Sin filas válidas la sección no se dibuja (en el editor muestra un aviso).

## Comportamiento

- Sin interacción: es contenido estático. Sin JS salvo con «Latido al aparecer»: `<df-comparison-table>` agrega `is-visible` al entrar un 40 % en pantalla y los íconos de nuestra columna laten tres veces y se detienen. Con `prefers-reduced-motion` no hay animación.
- La tabla se nombra con el título (`aria-labelledby`). Nuestra columna nunca depende solo del color: los valores se leen como texto.
- Con fondo propio oscuro, el texto pasa a blanco y el acento se ajusta a contraste AA contra ese fondo (`df-accent-vars`).
- Logo con `image_url` + `image_tag` (hasta 360 px, perezoso) y `alt` = nombre de nuestra columna.

## Psicología de venta

- **Objeción:** «¿por qué a ti y no a otro, o algo genérico más barato?».
- **Contraste y anclaje:** junto a una columna con cruces, nuestros checks valen más.
- **Opción dominada:** la columna de la competencia hace de señuelo; nadie la elige.
- **Conteo:** checks contra cruces se entienden sin leer; el veredicto es inmediato.
- **Saliencia:** el pilar de color lleva la mirada primero a nuestra columna.
- **Diferencia frente a lo que ya probó:** la columna rival es lo que el cliente ya usa («Crema más espesa», «Colágeno para tomar»); la tabla explica por qué esto es distinto y vale lo que cuesta.
- **Enemigo común sin nombre:** la alternativa es una categoría; no se ataca a nadie concreto.
- **Valor antes que servicio:** las filas de producto van primero. El pago al recibir y el envío ya los dicen los componentes de compra; en la tabla solo entran cuando se compara contra canales (dónde comprar).

La referencia marcaba cruz en todo, incluso en lo que la competencia sí tiene, animaba la columna en bucle infinito y usaba `div` sin semántica ni texto para los íconos. Aquí hay «parcial», al menos una fila honesta a favor de la competencia, latido opcional y finito y una tabla accesible.

## Reglas del copy (IA)

- Título: «[Producto] vs. [categoría genérica]» o «¿Por qué elegir [producto]?», ≤ 40 caracteres.
- Competidores (`other_labels`): 1 o 2, ≤ 24. Lo que el cliente **ya probó** (`alternatives_already_tried` del producto o el enemigo del ángulo «Enemigo común»), como categoría: «Crema más espesa», «Colágeno para tomar». «Genéricos» solo si no hay una alternativa previa clara. Nunca una marca.
- Filas: **4 a 6**, 2 a 5 palabras en positivo, ≤ 30. `basis` dice qué dato real sostiene nuestro valor.
  - **Al menos 3 de producto** (`basis: "spec"`: qué hace, dónde actúa, cómo entra en la rutina) y **van primero**.
  - Filas de compra (`policy` o `service`: pago al recibir, envío, cambios) **solo si las otras columnas son canales o tiendas** («Tiendas internacionales», «Tienda física», «Marketplaces»); contra una categoría de producto no se escriben. Lo decide `isChannelLabel` (en `content.ts`).
  - Validado en el esquema: filas `spec` ≥ 3, `spec` antes que las demás, y filas de compra solo con columnas de canal.
- Dos tipos de tabla: **producto contra alternativas** (solo filas de producto) y **dónde comprar** (canales: 3 filas de producto y después las de compra).
- Valores: `yes`, `no`, `partial` o `{ text }` corto; plazos con `{min}–{max}`. Al menos una fila con `yes` o `partial` en la competencia.
- **Prohibido:** marcas de terceros, «el mejor», «el único», «certificado», claims de salud, cifras escritas, decir que la competencia es falsa o insegura (Ley 19.496 arts. 28 y 33; Ley 20.169). El comerciante aprueba la tabla antes de publicarla.
