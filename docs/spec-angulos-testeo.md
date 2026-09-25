# Spec: ángulos de testeo y página coherente con el testeo

> Estado: **propuesta** (2026-09-25). Nada implementado. POC de la Fase 2 corrida sobre Deep Collagen (§8).
> Origen: sesión de mentoría Impulso Pro con Benja (coach), contrastada con `dropflex/docs/analisis-mentoria-impulso-pro.md`, con la etapa Ángulos (`lib/angles/`, `lib/pipeline/angles.ts`) y con el prompt de la página (`lib/copy/prompts.ts`).
> Toca: Ángulos, Página del producto, tema (`lib/shopify/components`), Creativos, Anuncios y, en una fase aparte, los valores por defecto del precio.
> Decisiones del usuario (2026-09-25): (1) el tono de la página lo define el **cliente ideal**, no el precio (casi todo se vende sobre $20.000); (2) **sin modo ganador** por ahora: la página es siempre la versión común a los ángulos de venta; (3) **sin integración con Dropkiller**: la competencia se carga con links a mano; (4) valores por defecto del costeo: **envío $9.000, confirmación 75 % y entrega 75 %**.

## 0. Resumen

Hoy DropFlex **elige un ángulo antes de testear**: el orquestador puntúa 6 ángulos, el comerciante confirma un principal y un secundario, y los dos se **mezclan en un solo mensaje** (el principal pone el gancho y el secundario refuerza el cuerpo). La página se escribe con el principal al mando.

El método que enseña la mentoría es otro:

1. **Primero el producto**: qué hace, qué problema resuelve y **en qué se diferencia** de lo que el cliente ya usa. Sin eso no se sigue.
2. **La competencia**: ¿por qué me compran a mí y no a las otras 7 tiendas? El ángulo sale de lo que la competencia **no** está usando.
3. **3 ángulos en el testeo**: 3 anuncios separados, cada uno 100 % en un ángulo y en su propio conjunto ($5.000 por conjunto en temporada alta). El mercado decide cuál funciona.
4. **Una página coherente con los 3**: el diferenciador manda y cada ángulo encuentra su bloque. (La mentoría rehace la página enfocada en el ángulo que gana; eso queda fuera de esta spec.)
5. **Se demuestra el valor y no se compite por precio**: la página muestra por qué el producto vale lo que cuesta, en el tono del cliente al que se le vende.

Esta spec lleva DropFlex a ese método en 5 fases que se pueden entregar por separado.

| Fase | Qué | Depende de |
|---|---|---|
| 0 | Sacar del tema la prueba social inventada | — |
| 1 | Diferenciador y competencia en Información base | — |
| 2 | Página común a los ángulos, bloque de dolor, comparativa y preguntas frecuentes | 1 (sirve también con los 2 ángulos de hoy) |
| 3 | Ángulos: 3 ángulos de testeo en vez de principal y secundario | 1 |
| 4 | Creativos y Anuncios: un ángulo por conjunto | 3 |
| 5 | Valores por defecto del costeo: envío $9.000 y 75/75 | — |

## 1. Diagnóstico (lo que hay hoy)

| Punto del método | Hoy en DropFlex | Dónde |
|---|---|---|
| Diferenciador del producto | No existe como campo. Solo el ángulo «mecanismo único» lo toca en parte | `ProductBrief` en `lib/ai/schemas.ts` |
| Competencia | El orquestador no la ve. `alternatives_already_tried` son categorías, no tiendas | `lib/angles/prompts.ts › contextBlock` |
| Ángulo = mensaje | Los 6 «ángulos» son **formas de contar** (autoridad, historia…), no qué dolor o deseo se destaca ni para quién | `lib/angles/catalog.ts` |
| 3 ángulos separados | Un principal y un secundario **combinados** en un mismo mensaje | `lib/pipeline/angles.ts`, `ROLE_LABEL` |
| Página coherente con el testeo | «El ángulo PRINCIPAL manda en la ficha y en los títulos de las secciones» | `lib/copy/prompts.ts:51`, `lib/copy/listing.ts` (title) |
| Dolor antes que producto | No hay componente de dolor; el cliente ideal llega al prompt, pero ninguna regla pide mostrar sus momentos | catálogo `lib/shopify/components` |
| Valor y no servicio en la comparativa | La guía pide 2 o 3 filas de compra contra entrega y compara con «Genéricos» | `comparison-table/content.ts` |
| Duración del producto | Las preguntas frecuentes prohíben cualquier número, así que «rinde 1 a 1,5 meses» no se puede escribir | `faq-and-text/content.ts` |
| Tono según el cliente | El cliente ideal llega al prompt, pero solo se usa para «sus palabras»; ninguna regla toma de él el registro (nivel socioeconómico, estilo de vida, sofisticación) | `lib/copy/prompts.ts` |
| Prueba social honesta | **El tema inventa «vendidos esta semana»** (150 a 350, calculado desde el id del producto) y trae por defecto el sello «Producto viral» | `inventory/blocks/df-inventory.liquid:37`, `_landing/blocks/df-hype-badge.liquid` |
| Un ángulo por conjunto | La campaña ABO asigna los textos por turno (`pick(primary_texts, i)`), no según el ángulo del creativo | `lib/ads/plan.ts:43` |
| Retargeting | Los creativos traen 1 concepto de oferta «para retargeting»; la mentoría no recomienda hacer retargeting | `lib/creatives/catalog.ts:66`, `lib/creatives/prompts.ts:68` |

## 2. Fase 0 — Prueba social inventada (urgente)

El README de componentes dice que se corrigió «lo que la referencia hacía mal (escasez y reseñas inventadas)», pero dos piezas del tema lo siguen haciendo:

- `inventory/blocks/df-inventory.liquid:37`: `assign sold = product.id | modulo: 201 | plus: 150`, y el texto por defecto es «🔥 Producto viral · {sold} vendidos esta semana». La cifra es inventada: para el comprador es una afirmación falsa (Ley 19.496, publicidad engañosa) y contradice la regla 3 del README.
- `_landing/blocks/df-hype-badge.liquid`: el texto por defecto es «Producto viral».

Cambios:

1. Eliminar `{sold}` y `viral_text` de `df-inventory` (Liquid, JS y schema). Si algún día se quiere mostrar ventas, tienen que salir de pedidos reales de Shopify y verse en un ajuste explícito, apagado por defecto.
2. Dejar vacío por defecto el texto de `df-hype-badge`. Sin texto, el bloque no se muestra.
3. Subir la versión del kit (`kit-history.json`) para que llegue a las tiendas instaladas. Según el principio 7 de `spec-tema-shopify.md`, un default de schema solo llega a los templates que no fijaron ese valor; en las tiendas que ya lo guardaron, `updateKitTheme` tiene que limpiar `viral_text` del template.
4. Test en `template-rules.test.ts`: ningún `.liquid` del kit calcula cifras a partir de `product.id`.

Fuera de DropFlex: «+371 vendidos – Solo 17 unidades disponibles» (el botón azul de Datazo) viene de la configuración de Releasit en la tienda. No se toca desde la app, pero se avisa en Publicar si se detecta (ver §5.6).

## 3. Fase 1 — Diferenciador y competencia (Información base)

### 3.1 Diferenciador

Nuevo campo en `productBriefSchema` (`lib/ai/schemas.ts`):

```ts
differentiator: z.object({
  versus: text.describe("Contra qué se diferencia: lo que el cliente usa hoy (categoría, nunca marca). Ej.: «su crema hidratante»."),
  claim: text.describe("La diferencia en una frase que se pueda sostener con la ficha. Ej.: «la crema sella por encima; esto es el paso previo, en gotas, que da algo que retener»."),
  basis: text.describe("De qué dato de la ficha sale (how_it_works, key_facts…)."),
}).nullable().describe("null si con la información no se puede sostener ninguna diferencia real."),
```

- Lo propone la IA al armar la ficha; **el comerciante lo confirma o lo edita** en Información base, junto al cliente ideal.
- **Si queda en `null`, se bloquea Ángulos** con el mensaje: «Antes de elegir ángulos: ¿en qué se diferencia tu producto de lo que tu cliente ya usa?». Es el filtro que la mentoría pone primero.
- `missing_inputs` lo pregunta primero cuando falta.
- Sube `PRODUCT_BRIEF_PROMPT_VERSION` (o la constante que corresponda).

### 3.2 Competencia

Nueva tabla (migración `20261018000000_product_competitors.sql`):

```sql
create table public.product_competitors (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  url         text not null,
  source      text not null default 'manual',   -- hoy solo 'manual'
  analysis    jsonb,                            -- ver abajo; null = sin analizar
  status      text not null default 'queued',   -- queued | running | succeeded | failed
  error_code  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, url)
);
-- RLS: el dueño lee; escribe solo service_role.
```

- **Entrada:** en Información base, «Tiendas de la competencia» acepta de 1 a 7 links. Con 0 se puede seguir, pero Ángulos avisa que el diferenciador sale a ciegas.
- **Análisis:** el servidor descarga el texto de la página (sin ejecutar JS, con límite de tamaño y tiempo) y hace una llamada `effort: "low"`:
  `{ price, compare_at, offer, main_angle: { pain_or_desire, segment, promise }, frame (uno de los 6), proof_used[], tone }`.
  Si la página no se puede leer, `failed` con `error_code` y el link queda para verlo a mano.
- **Sin integraciones:** los links los pega el comerciante (los saca de la biblioteca de anuncios, de Dropkiller o de donde quiera). No hay búsqueda automática de competencia. `source` queda como `'manual'`, pensado para una fuente futura.
- `deleteProducts`: cuelga en cascada de `products`; no necesita pasos nuevos (actualizar la lista de CLAUDE.md).

## 4. Fase 3 — Ángulos de testeo

> Se describe antes que la página porque la página la consume, aunque la Fase 2 puede salir antes con los 2 ángulos actuales (§5.7).

### 4.1 Qué es un ángulo desde ahora

| Concepto | Qué es | Ejemplo (Deep Collagen) |
|---|---|---|
| **Ángulo** | El mensaje: qué dolor o deseo destacas, para quién y con qué promesa | «La crema sella; lo que faltaba va antes», para la que ya usa crema y amanece tirante |
| **Forma** (`frame`) | Cómo se cuenta: los 6 de `catalog.ts`, que no cambian | Mecanismo único |

Los 6 actuales pasan a ser **formas**. Sus criterios, penalizaciones, guías (`GUIDES`) y el puntaje en código (`score.ts`) se reutilizan para decidir **con qué forma contar cada ángulo**.

### 4.2 El orquestador

Entrada nueva: el diferenciador confirmado y el análisis de la competencia.

Salida (sube `ANGLE_ROUTER_PROMPT_VERSION`):

```ts
test_angles: z.array(z.object({
  pain_or_desire: text,            // «amanecer con la cara tirante aunque use crema»
  segment: text,                   // «la que ya tiene rutina básica y siente que no le alcanza»
  promise: text,                   // la promesa, dentro de forbidden_claims
  frame: z.enum(SALES_ANGLES),     // la forma recomendada
  frame_scores: { c1, c2, c3, penalty },   // los criterios de esa forma, como hoy
  competition: text,               // cuántas tiendas lo usan y por qué este es distinto
  trigger_moment: text,            // el momento del cliente ideal que abre el anuncio y el bloque de dolor
})).describe("5 candidatos distintos entre sí: distinto dolor o distinto segmento, no la misma idea contada de otra forma."),
```

- **El código elige los 3 sugeridos** (`score.ts`): puntaje de la forma, más un bono si **ninguna tienda de la competencia lo usa**, menos una penalización si 3 o más lo usan. Regla de variedad: no más de 2 con la misma forma.
- El comerciante **elige 3 de 5**, puede cambiar la forma de cada uno y editar dolor, segmento y promesa. No hay principal: los 3 valen lo mismo.
- Sin competencia cargada, el bono no se aplica y la pantalla lo dice.

### 4.3 Los desarrollos

- `angle_briefs.role` (`primary` | `secondary`) se reemplaza por `slot smallint` (1, 2 o 3). Migración: `primary → 1`, `secondary → 2`. Las filas antiguas quedan válidas; la etapa pide elegir un tercero para completarse.
- Cada desarrollo usa el agente de su **forma** (`angleSystem(frame)`), pero con el ángulo como contexto: dolor, segmento, promesa y momento. El handoff deja de hablar de «principal que abre y secundario que refuerza» y dice «este anuncio es el único que ve esta persona: 100 % este ángulo».
- Los 3 corren en paralelo. `DAILY_BRIEFS` pasa de 60 a 90.
- `briefBase.landing` (la recomendación de página por ángulo) se elimina: con 3 ángulos se contradice con la página común. En su lugar, `page_block`: «qué momento o beneficio tiene que encontrar en la página quien viene de este anuncio», en una o dos frases.
- La etapa se completa con **3 desarrollos aprobados**.

## 5. Fase 2 — Página del producto

### 5.1 Una sola página, común a los ángulos

No hay modos. La página es siempre la versión **común a los ángulos de venta aprobados**: el diferenciador manda en la ficha y en los títulos de sección, cada ángulo aporta al menos un bloque visible y el bloque de dolor tiene un momento por ángulo. Rehacer la página enfocada en el ángulo que gana (lo que hace la mentoría cuando encuentra un ganador) queda fuera de esta spec. Si se hace más adelante, entra como un `redo` con un solo ángulo, sin cambiar el modelo de datos.

### 5.2 Reglas del prompt (`lib/copy/prompts.ts`)

La regla del ángulo principal (línea 51) se reemplaza por:

1. **Común a los ángulos:** la página recibe tráfico de 3 anuncios distintos. Quien llega desde cualquiera debe reconocer en la primera pantalla lo que su anuncio le prometió. Ningún ángulo se adueña de la página, y tampoco se vuelve genérica («para todo tipo de piel», «cuidado facial»).
2. **El diferenciador manda** en el título, la descripción corta y los títulos de sección.
3. **Cada ángulo aporta al menos un bloque** visible (beneficio, razón, pregunta o momento), sin nombrarlo como ángulo.
4. **Dolor antes que producto:** el bloque de dolor usa los momentos del cliente ideal, con sus palabras.
5. **Valor por sobre confianza:** el pago al recibir y el envío los cubren los componentes de compra. En `image-with-benefits`, `stats-with-image`, `comparison-table` y `gif-strip` va el producto: resultado, uso y diferencia frente a lo que ya probó.
6. **El tono lo define el cliente ideal:** el registro de la página sale del cliente ideal aprobado, no del precio. Se toma de `demographics.socioeconomic_level`, `identity.lifestyle`, `market_sophistication` y `voice_of_customer`: cómo habla, qué le da confianza y cuántas promesas ya vio. Con sofisticación 3 o más, nada de exageraciones ni superlativos: descuenta el efecto milagro y le convencen los datos concretos. En ningún caso se escriben «viral», «increíble», mayúsculas sostenidas ni urgencia sin dato real (esto último ya es regla).
7. **Nada de contexto inventado:** los escenarios de uso salen del cliente ideal o de la ficha. La POC escribió «cuando el aire acondicionado te reseca la cara», que no estaba en ninguna parte.

Otros consumidores del «ángulo principal»: los textos de Eventos (`event_copy`, «mantiene el ángulo principal») pasan a mantener el **diferenciador**, y la etapa Imágenes (beneficios `benefit-1…3`, que hoy salen «de la ficha y los ángulos») toma un beneficio por ángulo.

`CopyContext` cambia: `primary` y `secondary` pasan a `angles: { slot, name, payload }[]`, más `differentiator`. `briefForPage` manda `core_message`, `psychological_lever`, `objection_handling`, `details`, `compliance_flags` y `page_block` (sin `landing`). Sube `COPY_PROMPT_VERSION`.

### 5.3 Componente nuevo: `pain-block`

| | |
|---|---|
| Tipo | Sección |
| Dónde va | Después de la galería y la ficha, **antes de `image-with-benefits`** (primer bloque del cuerpo) |
| Responde | «¿Esto es para mí? ¿Entienden lo que me pasa?» |
| Metafield | `dropflex.pain_block` (json) |
| Datos reales | Ninguno: es texto. Imagen opcional (un momento de uso), elegida en Imágenes |

`content.ts`:

```ts
content: z.object({
  heading: z.string().min(8).max(48),                  // «¿Te pasa esto frente al espejo?»
  moments: z.array(z.object({
    slot: z.number().int().min(1).max(3),              // el ángulo al que le hace puente
    title: z.string().min(8).max(40),
    text: z.string().min(30).max(160),                 // primera o tercera persona
  })).length(3),
  bridge: z.string().min(20).max(120),                 // del dolor al diferenciador
}).superRefine(/* un momento por slot */),
```

- **Reglas:** primera persona («me lavo la cara…») o tercera («quienes ya usan crema…»). Las palabras salen de `voice_of_customer` y `trigger_moments`. Nada de afirmaciones de salud; el remate lleva al diferenciador, no a la oferta.
- **Prohibido:** diagnosticar al lector («tienes la piel deshidratada»), cifras, plazos, promesas de resultado y dramatizar al punto de humillar («tu cara se ve vieja»).
- **Piezas:** `sections/df-pain-block.liquid` (con autoprotección y tokens `--df-*`, como el resto), `README.md`, entrada en `catalog.ts`, preview React en la etapa Página, clave en `lib/shopify/publish/mapping.ts`, lugar en `templates/product.json` del kit y nueva versión del kit.
- **Ejemplo** (salida de la POC, §8):

  > **¿Te pasa esto frente al espejo?**
  > · *Otra crema más en el velador* — «Probé cremas más espesas, mascarillas y colágeno de tomar. Nunca supe si algo hizo efecto…»
  > · *La cara tirante a las siete* — «Me lavo la cara, me echo crema y a media mañana la piel vuelve a sentirse tirante…»
  > · *La base marcada en las líneas* — «Tengo treinta y tantos y lo que más me molesta es ver la base acumulada al lado de la nariz…»
  > *La crema sella. Lo que faltaba es el paso de antes: unas gotas ligeras sobre piel limpia.*

### 5.4 `comparison-table`

- **Contra qué:** `other_labels` salen de `alternatives_already_tried` (o del enemigo del ángulo «Enemigo común» si alguno lo usa): «Crema más espesa», «Colágeno para tomar». «Genéricos» queda solo para productos sin alternativa previa clara.
- **Filas:** de 4 a 6, **al menos 3 de producto y primero** (qué hace, dónde actúa, cómo entra en la rutina).
- **Filas de compra** (pago al recibir, envío): solo cuando las otras columnas son **canales o tiendas**. Contra categorías de producto no tienen sentido; la POC escribió «Pago al recibir: parcial» para «Crema más espesa».
- Validación: `rows.filter(basis === "spec").length >= 3`. Si `other_labels` no son canales, ninguna fila `policy` o `service`.
- Se reemplazan los ejemplos del corrector de postura por uno de cada tipo.

### 5.5 `faq-and-text` e `image-with-benefits`

- **Tema nuevo `duracion`** en las preguntas frecuentes, obligatorio si la ficha trae rendimiento o duración. Puede llevar dígitos **solo si aparecen en los datos de la ficha** (`key_facts` o `base_info`). La validación compara contra esa lista (`lib/copy/facts.ts`); los plazos de entrega y garantía siguen siendo tokens.
- **Tema `resultados`** obligatorio en categorías de belleza y bienestar: se condiciona al uso constante y sin plazo, como ya dice la regla actual.
- **Etiquetas de packs:** cuando hay duración, la primera razón del pack es «meses de rutina» y después el regalo (`lib/pricing` › etiquetas).
- `image-with-benefits`: al menos una tarjeta con **el ingrediente o el mecanismo del diferenciador**. La POC sacó «Colágeno y péptidos», que es justo lo que le da nombre al producto.

### 5.6 Publicar

- `pain-block` entra al mapeo y al orden de la página.
- **Aviso, sin bloquear:** si el texto visible de la ficha publicada (se lee con el mismo fetch de §3.2) contiene «viral», «vendidos», «últimas unidades» o «solo quedan» y no sale de un componente con datos reales, Publicar lo muestra: «Tu página muestra “+371 vendidos”: no viene de DropFlex. Si no es un dato real, quítalo de la configuración de tu formulario».

### 5.7 Compatibilidad con los 2 ángulos de hoy

Mientras no esté la Fase 3, la página usa los 2 desarrollos aprobados como `slot` 1 y 2. El tercer momento del bloque de dolor sale de `trigger_moments` del cliente ideal, sin ángulo asociado. Así, la Fase 2 puede salir antes.

Cuando llegue la Fase 3, los productos con 2 desarrollos aprobados **no se bloquean**: Página, Imágenes y Creativos siguen funcionando con 2 ángulos. Ángulos muestra «Agrega un tercer ángulo para testear» como sugerencia, no como requisito.

### 5.8 Reprocesar una página ya escrita

**Lo que existe hoy** (revisado en `components/screens/copy.tsx`, `app/api/products/[id]/copy/**` y `lib/pipeline/copy.ts`):

| Acción | Qué hace | Límite |
|---|---|---|
| «Reescribir lo no aprobado» (`POST /copy { redo: true }`) | Reescribe los componentes que no están aprobados y los que faltan (un componente nuevo del catálogo entra aquí) | **Nunca toca lo aprobado.** Se deshabilita si todo está aprobado (`redoable`); el servidor responde 409 «Ya aprobaste toda la página» |
| «Usar en la página» (`PATCH { enabled }`) | Activar aprueba; desactivar saca el componente de la página | Desactivar **conserva `approved`**: no lo devuelve a revisión |
| Guardar la hoja (`PATCH { content }`) | Edita a mano y aprueba | — |
| «Aprobar ficha» (`PATCH { approve }`) | Aprueba la ficha | No hay acción inversa |

**Lo que falta:**

- **No hay forma de desaprobar** un componente ni la ficha, así que una página aprobada entera no se puede volver a escribir con IA. Solo se puede editar a mano, campo por campo.
- **La página no queda desactualizada** cuando cambian los desarrollos de Ángulos ni cuando sube `COPY_PROMPT_VERSION`: `copyPhase` (`lib/products/stages.ts`) no tiene ese estado, aunque `copy_runs.input.briefs` guarda con qué desarrollos se escribió.

**Qué pasaría con Deep Collagen** (piloto, se deja como está): tiene la ficha y 11 componentes aprobados, y 3 sin aprobar (`gif-strip`, `ugc-slider` e `insta-story`, apagados). Con la Fase 2, «Reescribir lo no aprobado» escribiría **solo esos 3 y el `pain-block` nuevo**; la ficha, la comparativa y las preguntas frecuentes quedarían con las reglas antiguas. Para el piloto está bien: permite comparar el bloque de dolor sin cambiar nada de lo aprobado.

**Propuesta** (para los productos que sí se quieran migrar):

1. **«Volver a escribir con IA»** en la hoja de cada componente y de la ficha. Reescribe solo ese componente, con lo demás aprobado como contexto (el mismo mecanismo que `approved` en `copyUser`). La versión aprobada queda con `superseded_at` y se puede recuperar con «Deshacer» durante la sesión. No publica nada: lo publicado en Shopify cambia recién al volver a Publicar.
2. **«Reescribir toda la página»** en el menú de la etapa, con segundo toque («Se reemplaza lo aprobado; lo publicado no cambia hasta que publiques»). Es un `redo` que también marca como `superseded_at` lo aprobado. Los textos editados a mano (`content` distinto de `proposal`) se listan antes de confirmar, porque se pierden.
3. **Página desactualizada:** si los desarrollos aprobados cambian (comparando con `copy_runs.input.briefs`) o sube la versión mayor del prompt, la etapa muestra «Tus ángulos cambiaron desde que se escribió la página» con el botón de la acción 2. No reescribe sola.

## 6. Fase 4 — Creativos y Anuncios

- **Creativos** (`lib/creatives/catalog.ts`, `prompts.ts`): en vez de «3 del principal, 2 del secundario y 1 de oferta para retargeting», **2 conceptos por ángulo** (6 en total). Los 2 de un mismo ángulo en **formatos distintos**: por ejemplo, un estático y un guion de video, o un video con avatar de IA y un video grabado. La oferta pasa a ser una capa dentro de cada concepto, no un concepto aparte. `creative_concepts.angle_role` pasa a `angle_slot`.
- **Textos del anuncio** (`lib/ads/texts.ts`): `hooks` pasa a ser `{ slot, hook }[]`. Cada creativo lleva el texto de **su** ángulo.
- **Plan ABO** (`lib/ads/plan.ts:43`): el texto de cada anuncio se toma por `slot` del creativo, no por turno (`pick(primary_texts, i)`). Los conjuntos se nombran por ángulo: «Conjunto 1 · La crema sella».
- **Preset nuevo `impulso-temporada`** (`lib/ads/presets.ts`): ABO, 3 conjuntos abiertos (**uno por ángulo**, con un creativo cada uno), $5.000 por conjunto, 06:00. El preset `impulso` actual (2 conjuntos de $5.000) queda igual. La mentoría usa 2 conjuntos de $7.500 fuera de temporada: se puede ofrecer como variante del mismo preset.
- **Lectura del testeo** (Campañas): revisar cada conjunto al llegar a **1,5 veces el CPA de costeo** gastado. Con una venta a un CPA cercano a ese valor, se deja hasta el día siguiente. La señal temprana son los **pagos iniciados** más las compras. Se documenta en `spec-anuncios.md`.

## 7. Fase 5 — Valores por defecto del costeo (decidido)

`CLP_DEFAULTS` (`lib/pricing/plan.ts:79`) pasa de envío $8.000 y 70/70 a **envío $9.000, confirmación 75 % y entrega 75 %**. El CPA de costeo sigue en $5.000.

| | Antes | **Ahora** | Referencia |
|---|---|---|---|
| Envío | 8.000 | **9.000** | Planilla del curso 7.500 (la clase dice 8.500); Benja 9.500 |
| Confirmación / entrega | 70 / 70 | **75 / 75** | Planilla del curso y Benja: 75 / 75 |
| CPA de costeo | 5.000 | 5.000 | Igual en todas las fuentes |

- Solo afecta a los productos **nuevos** y a los que no tienen precio guardado: los planes guardados en `product_pricing` no se tocan.
- Revisar los tests de `lib/pricing` que fijan 8.000 y 70/70, y los textos de ayuda del onboarding (`/onboarding/numbers`) si muestran los valores por defecto.

## 8. POC (Fase 2, 2026-09-25)

- **Qué se probó:** el prompt de `lib/copy/prompts.ts` con las reglas de §5.2, el bloque `pain_block`, los ajustes de comparativa y preguntas frecuentes, y 3 ángulos (enemigo común, mecanismo único e identidad), sobre los datos reales de Deep Collagen. Datos leídos en solo lectura de prod: ficha, cliente ideal, precio, etiquetas de los packs, desarrollos aprobados y 10 reseñas aprobadas. Modelo `claude-opus-5`, esfuerzo medio: 44 k tokens de entrada, 11,7 k de salida y 133 s. No se escribió en la base ni en Shopify.
- **Resultado:**
  - Bloque de dolor con un momento por ángulo, bien logrado.
  - Comparativa contra «Crema más espesa» y «Colágeno para tomar», con 4 filas de producto y 1 de compra (antes eran 3 y 3).
  - Preguntas frecuentes nuevas: «¿Cuánto me dura un frasco?» (escrita en palabras) y «¿Cuándo voy a notar algo?».
  - El título casi no cambió: en este producto el ángulo secundario ya era el diferenciador. El efecto se verá en productos donde el principal era Oferta o Identidad.
  - Los componentes de compra quedaron iguales, que es lo esperado.
- **Defectos que la spec corrige:**
  - Fila «Pago al recibir» contra categorías de producto (§5.4).
  - Se perdió la tarjeta del ingrediente (§5.5).
  - Contexto inventado (§5.2, regla 7).
  - Un campo basura `question_` en una pregunta frecuente (lo limpia la validación estricta).
  - 2 textos pasados de largo en `benefit-double-box` (los corrige el reintento).
- **Hecho técnico:** el esquema completo de la página ya excede la gramática de la salida estructurada («compiled grammar is too large»). Producción cae a `generateUnconstrained`, y la POC también. Sumar `pain-block` no cambia eso, pero conviene medir la tasa de reintentos al publicar la Fase 2.

## 9. Tests

- `lib/angles/score.test.ts`: bono y penalización por competencia; variedad de formas (no más de 2 iguales); sugerencia de 3.
- `lib/copy/copy.test.ts`: el prompt no contiene «ángulo PRINCIPAL»; lleva los N ángulos aprobados y el diferenciador; la regla de tono cita los campos del cliente ideal.
- `pain-block`: esquema (3 momentos, un `slot` por momento), autoprotección del Liquid, entrada en `mapping.test.ts` y `template-rules.test.ts`.
- `comparison-table`: al menos 3 filas `spec`; sin filas `policy` contra categorías de producto.
- `faq-and-text`: dígitos permitidos solo en `duracion` y solo si están en los datos de la ficha.
- `lib/ads/plan.test.ts`: cada anuncio lleva el texto de su `slot`.
- Reprocesar (§5.8): reescribir un componente conserva el resto aprobado; «Reescribir toda la página» marca `superseded_at` en lo aprobado y no toca `product_publications`; `copyPhase` devuelve desactualizada cuando cambian los desarrollos.
- `template-rules.test.ts` (Fase 0): ningún Liquid calcula cifras desde `product.id`.

## 10. Decisiones

Resueltas el 2026-09-25:

- El tono lo define el cliente ideal, no el precio.
- Sin modo ganador.
- Sin Dropkiller.
- Valores por defecto: envío $9.000 y 75/75.
- **Deep Collagen se deja como piloto**: su página aprobada no se reescribe. Con la Fase 2 solo se le escribirían los componentes sin aprobar y el `pain-block` (§5.8).

Sin preguntas abiertas.
