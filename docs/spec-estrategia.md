# Datos del producto y Estrategia (prompts en la base)

Decisión del comerciante, 2026-10-05. Reemplaza la primera parte del pipeline de IA (ficha v9, cliente
ideal v6, orquestador de ángulos v9, formas, 6 agentes de ángulo, ganchos v7 y su crítico): nueve
llamadas con prompts en el código que no se podían ajustar sin un deploy. Ahora son dos pasos y sus
prompts se editan en la base.

## 1. Datos del producto (Información base)

- «Identificar con IA» (`POST /api/products/[id]/product-data`, paso `product_data`): la IA mira las
  imágenes en uso (la base primero) y lo que sabe el comerciante, y escribe el **nombre** y la
  **descripción** del producto (una característica por línea y, al final, «Falta: …»). Solo hechos.
- El comerciante los corrige en la tarjeta «Datos del producto» (autoguardado, `PUT`). Se guardan en
  `products.product_data` (`{ name, description, source: 'ai' | 'merchant', updated_at }`).
- Información base queda lista con los datos del producto **y** el precio guardado.

## 2. Estrategia (etapa `angulos`, `/products/[id]/angles`)

1. «Generar estrategia» crea una corrida en `strategy_runs` y la corre en segundo plano (`after()`,
   `maxDuration = 300`, el máximo del plan Hobby de Vercel): el **mega prompt** activo, tal cual, con sus tags llenos y la imagen base
   delante, sin system prompt.
2. El informe se escribe con streaming (`generateText`) y se guarda cada pocos segundos en
   `strategy_runs.report`: la pantalla lo muestra mientras se escribe.
3. La **extracción** (paso `strategy_extract`, effort low, prompt en `lib/strategy/prompts.ts`) pasa el
   informe a datos en dos llamadas en paralelo, porque un solo esquema pasaba el tamaño de gramática
   probado (`PROVEN_GRAMMAR_SIZE`):
   - **perfil**: la ficha (lo que leen los pasos siguientes; precio, packs y reseñas reales los pone el
     código), el cliente número 1, las etiquetas de los packs y los 3 conceptos del primer dólar;
   - **ángulos**: el TOP 5 con su forma, AIDA, objeciones, oferta, conceptos UGC y 3 a 6 hooks cada uno.
   `strategyExtractProblems` pide exactamente 5 ángulos distintos con 3 a 6 hooks; si falla, se pide una
   vez más con los problemas.
4. El comerciante elige **2 o 3** ángulos del TOP 5 y «Usar estos ángulos» (`confirmStrategy`) escribe
   las filas de siempre: `product_briefs`, `customer_avatars` (aprobado), `angle_rankings` (confirmado) y
   un `angle_briefs` aprobado por ángulo con sus ganchos. Imágenes, Página, Creativos, Video, Eventos y
   Anuncios las leen igual que antes.

Lo que el informe trae se usa tal cual. Los validadores de los pasos siguientes siguen activos: un
gancho que roza la política queda con `policy_ok = false` y `usableHooks` no lo usa.

## 3. Los prompts en la base

| `prompt_templates` | |
|---|---|
| `key` | `product_data` o `strategy` |
| `version` | 1, 2, 3… (cada guardado crea la siguiente) |
| `body` | El texto, con sus tags literales |
| `model`, `effort`, `max_tokens` | Cómo se llama a Claude |
| `is_active` | Una activa por `key` (`activate_prompt_template` cambia de versión en una transacción) |

**Tags** (`lib/prompts/tags.ts`): el texto exacto del prompt que el código reemplaza.

| Tag | Valor |
|---|---|
| `[ESCRIBE EL NOMBRE DEL PRODUCTO]` | Nombre de Datos del producto |
| `[DESCRIPCIÓN O PEGA LA INFORMACIÓN DEL PRODUCTO]` | Descripción de Datos del producto |
| `[PRECIO]` | «$24.990 (1 unidad) · precio tachado … · Packs: 2 unidades por … · Pago contra entrega» |
| `[PAÍS]` | País de la tienda |
| `[COSTO, SI LO CONOCES]` | Costo del proveedor + envío promedio |
| `[NOMBRE EN SHOPIFY]` / `[INFORMACIÓN DEL COMERCIANTE]` | Los de Datos del producto |

**Ajustes › Prompts** (solo `app_metadata.role = "admin"`): ver y editar el texto, el esfuerzo y el tope
de tokens, ver qué tags se llenan solos, guardar como versión nueva (falla si falta un tag) y volver a
una versión anterior. Cada generación guarda la versión de su plantilla en
`ai_generations.prompt_version`: `npm run ai:metrics -- --step strategy` compara versiones.

## Riesgos conocidos

- **Duración**: el plan Hobby de Vercel no acepta funciones de más de 300 s (con 800, Vercel rechazó el
  deploy). El informe tiene 210 s (`STRATEGY_REPORT_BUDGET_MS`) y la extracción el resto; si el informe
  pasa ese tope, se corta y la corrida falla con el motivo («baja el esfuerzo a Medio en Ajustes ›
  Prompts»), sin deploy. Una corrida sin avance en 15 minutos queda fallida (`expireStaleStrategies`).
- **Costo**: estimado en ~US$1,50 por estrategia (`DEFAULT_STEP_USD`), y se ajusta solo con el historial.
