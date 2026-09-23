# ProductInfoInput

Campo único donde el comerciante pega todo lo que sabe del producto; la IA lo ordena y dice qué encontró.

- **Qué provees:** `value`, `found` (temas que la IA detectó en el texto), `fromShopify` (muestra el aviso "Incluye la descripción de Shopify"), `saving` / `saved` (autoguardado), `rows`, `label`, `hint`, `placeholder`, `suggest` (chips a mostrar; por defecto, los temas que faltan).
- **Un solo campo, no un formulario.** El comerciante tiene la información desordenada (texto del proveedor, notas, reseñas). Pedirle que la reparta en 10 campos lo frena; pegarla toda en uno, no.
- Viene lleno con la descripción importada de Shopify para no partir de cero.
- Los chips "+ Tema" agregan una línea con ese título al final del texto, para guiar sin obligar.
- Debajo, la cobertura: temas encontrados en `success-soft` con check, los que faltan con contorno. "Suficiente para empezar" desde 3 temas; nunca bloquea.
- Autoguardado a los 1,5 s sin escribir, con "Guardando" → "Guardado hace N s". No hay botón Guardar.
- Texto a 16px (evita el zoom en iOS), `resize: vertical`, sin límite estricto; el contador es informativo.
