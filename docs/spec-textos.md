# Spec: etapa Textos (la página del producto)

> Estado: **implementado el 2026-09-23** con el diseño PantallasTextos1/2 y PantallasTextosEscritorio (`design-system/textos.md`). Falta la prueba con la IA real (F6). El detalle de lo construido está en `docs/pipeline-ia.md` › Página del producto.
> Fecha: 2026-09-23.
> Decisiones tomadas (§8): Textos es la página del producto y en la UI se llama **Página del producto**; la tienda despacha con **envío gratis a todo Chile y pago contra entrega** (`merchant_settings.free_shipping`); SEO, nombre corto y los demás bloques del diseño van desde ya.
> Depende de: Ángulos (los 2 desarrollos aprobados), Información base (ficha, cliente ideal, precio y packs) y Reseñas (opcional).

## 0. Resumen

Textos es la etapa que escribe **la página del producto en la tienda**: título, descripción corta, beneficios, cómo funciona, preguntas frecuentes, envío y pago, y SEO. Cada texto es una propuesta que el comerciante acepta, edita o descarta. Lo aprobado es lo que después sube Publicar a Shopify.

Hoy la pantalla existe ([copy/page.tsx](../app/(app)/products/[id]/copy/page.tsx)) con el flujo de revisión (`ReviewFlow`), pero nada genera las propuestas. `getProductContent` devuelve vacío, así que la pantalla se queda en «La IA está escribiendo los textos».

**Qué NO es Textos.** El texto del anuncio en Meta (texto principal, títulos, descripción y botón) lo escribe `copywriter` (`agentes-creativos 4/copywriter.md`). Ese agente necesita el creativo ya aprobado (un estático o un guion) para elegir el largo y no repetir el titular, así que va después de Imágenes y los guiones, dentro de Anuncios. Queda fuera de este spec.

Reglas:

1. **La IA escribe el contenido y el código arma la página.** El modelo devuelve bloques de texto plano. El HTML de la descripción de Shopify lo arma una plantilla en Publicar, nunca el modelo.
2. **Esquema compacto y validado en código**, como Ángulos: una lista de bloques con una clave de un enum. Largos, cantidades, precios y garantía se revisan en `copyProblems`. Si algo falla, se pide otra respuesta diciendo qué falló (un reintento); si vuelve a fallar, la generación queda con error. Nunca se completa ni se recorta en silencio.
3. **Nada inventado que se presente como real.** Reseñas, expertos, cifras, plazos, garantía y «precio antes» solo si están en la ficha o en el precio.
4. **Cierre de LATAM:** pago contra entrega siempre. La garantía solo si la ficha trae `guarantee_days`.
5. **La UI no cambia de diseño.** Se conecta `ReviewFlow` a datos reales y se agregan los estados que faltan con componentes de `components/df`.

---

## 1. Qué hay hoy

| Pieza | Dónde | Hoy |
|---|---|---|
| Pantalla | `app/(app)/products/[id]/copy/page.tsx` | `ReviewFlow` sobre `getProductContent`, o un `EmptyState` fijo |
| Revisión | `components/screens/review-flow.tsx` | Una propuesta a la vez, deshacer, atajos A/D/E. `onDecide` es opcional y no persiste nada |
| Tipo | `lib/types.ts` `ContentItem` | `field` (etiqueta), `original`, `proposal`, `status`, `note` |
| Datos | `lib/data/products.ts` `getProductContent` | Devuelve `[]` |
| Ejemplo | `lib/mock/content.ts` | 8 campos del Corrector de postura. **Ojo:** su «Garantía» de 30 días contradice la regla 4 y no debe usarse como referencia |
| Ruta | `lib/products/stages.ts` | Textos se habilita con los 2 desarrollos aprobados; Imágenes dice «Después de Textos» |
| Tabla propuesta | `docs/esquema-supabase.md` `content_items` | En español y sin historial de generaciones; se reemplaza por §4 |
| Entradas | `product_briefs`, `customer_avatars`, `product_pricing` + `pack_labels`, `angle_briefs`, `product_reviews` | Ya existen |

De los desarrollos de ángulo se usan campos que ya vienen con estructura: `core_message`, `psychological_lever`, `proof_to_show`, `objection_handling` (`{objection, answer}`), `offer_layer`, `landing` y `details`. **No hace falta cambiar el esquema de los desarrollos** para esta etapa. Las etiquetas que se quitaron, como el tipo de gancho o los beats por etapa, las necesitan el guionista y los estáticos, no la página.

---

## 2. Qué produce

Una página en bloques. `key` va en inglés (modelo de datos) y `label` en español (lo que ve el comerciante).

| key | label | Cant. | Largo | Fuente principal | Original de Shopify |
|---|---|---|---|---|---|
| `title` | Título del producto | 1 | ≤ 70 caracteres | Ángulo principal (`core_message`) + qué es | `products.title` |
| `short_name` | Nombre corto | 1 | ≤ 30 | Ficha (`product_name`) | — |
| `short_description` | Descripción corta | 1 | ≤ 160 | Principal | — |
| `offer_line` | Frase de la oferta | 1 | ≤ 90 | Packs + `offer_layer` + «Paga al recibir» | — |
| `benefit` | Beneficio 1…n | 3 a 5 | ≤ 110 c/u | Principal y secundario, cada uno con un dato de `key_facts` | — |
| `how_it_works` | Cómo funciona | 1 | 40 a 120 palabras | `how_it_works` de la ficha + `details` del mecanismo o del enemigo | — |
| `faq` | Pregunta frecuente 1…n | 3 a 6 | pregunta ≤ 90, respuesta ≤ 280 | `objection_handling` de los 2 desarrollos + `known_objections`; al menos una del pago contra entrega | — |
| `shipping_payment` | Envío y pago | 1 | ≤ 280 | Pago contra entrega + datos de la tienda (§8, decisión 2) | — |
| `guarantee` | Garantía | 0 o 1 | ≤ 160 | Solo si `proof.guarantee_days > 0` | — |
| `seo_title` | Título para Google | 1 | ≤ 60 | Título | SEO actual, si se importa |
| `seo_description` | Descripción para Google | 1 | ≤ 155 | Descripción corta | SEO actual, si se importa |

- Las **reseñas** no se escriben: Publicar las toma de `product_reviews` tal cual.
- La **descripción larga de Shopify** no es un bloque: es la unión, hecha con la plantilla, de descripción corta + beneficios + cómo funciona + preguntas frecuentes + envío y pago (+ garantía). El original que hoy está en `products.description` se muestra como referencia en «Cómo funciona».
- `short_name` lo leen después los estáticos y el copywriter. `offer_line` va bajo el precio en la tienda.
- Cada bloque trae `angle`: `primary`, `secondary` o `none`. La tarjeta muestra de qué ángulo sale, con el `RoleChip` que ya existe.

---

## 3. El agente: redactor de página

No hay un `.md` para este agente en `agentes-creativos 4`, así que se escribe en `lib/copy/prompts.ts`, con la misma estructura que los de ángulo.

**Entrada** (`copyUser`):
- ficha;
- cliente ideal (dolor, deseo, lenguaje propio, objeciones);
- `pricingBlock` con las etiquetas de packs aprobadas;
- `marketBlock`;
- los 2 desarrollos aprobados, marcados PRINCIPAL y SECUNDARIO;
- reseñas reales (solo para saber qué se puede afirmar, no para reescribirlas);
- el título y la descripción actuales de Shopify;
- en una regeneración, los bloques ya aprobados, que no se tocan, y los descartados, que no se repiten.

**Reglas** (`copySystem(market)`), reutilizando `COMMON_RULES` de `lib/angles/prompts.ts`:
- El ángulo principal manda en el título, la descripción corta y «cómo funciona». El secundario aporta al menos un beneficio y una pregunta.
- Es una página, no un anuncio. El lector ya hizo clic, así que no hay gancho de 3 segundos. Cada bloque responde lo que el comprador pregunta en ese punto: qué es, por qué funciona, para quién, cuánto cuesta, cómo pago, qué pasa si no me sirve.
- Beneficio = resultado + el dato que lo sostiene («Tela transpirable que puedes usar bajo la ropa todo el día»), nunca un adjetivo suelto.
- Los precios y los packs se copian de PRECIO Y OFERTA, con el formato de la moneda. «Antes $X» solo con `compare_at_price` real.
- Claims de salud con «ayuda a» o «diseñado para». Nunca «cura», «elimina» ni «trata», ni plazos médicos.
- Sin política de atributos personales de Meta, que en la página no aplica, pero sí la ley del consumidor del país (`consumerAuthority`).
- Tuteo y el idioma del mercado. Nada de modismos fuertes.

**Llamada:** `generateStructured`, `effort: "medium"`, `maxTokens` 8000 y `prompt_version` propia (`COPY_PROMPT_VERSION = 1`). Con el fallback sin gramática que ya tiene `lib/ai/claude.ts`.

### 3.1 Esquema (`lib/copy/schemas.ts`)

```ts
const block = z.object({
  key: z.enum(PAGE_BLOCKS),              // title, short_name, short_description, offer_line, benefit, how_it_works, shipping_payment, guarantee, seo_title, seo_description
  text: text,
  angle: z.enum(["primary", "secondary", "none"]),
  note: text.describe("Por qué lo propones, para el comerciante, en una frase («Más corto, con el beneficio al frente»)."),
});
export const pageCopySchema = z.object({
  blocks: z.array(block),
  faq: z.array(z.object({ question: text, answer: text, angle: z.enum(["primary", "secondary", "none"]) })),
  proof_used: z.array(text).describe("Qué dato real de la ficha respalda cada cifra o afirmación fuerte."),
  missing_inputs: z.array(text),
  compliance_flags: z.array(text),
});
```

Son unas 15 propiedades, bastante menos que el cliente ideal. El test de tamaño de `lib/angles/prompts.test.ts` se amplía a este esquema.

### 3.2 Validación (`copyProblems(output, facts)`)

Devuelve la lista de problemas, que va vacía si se puede guardar. Revisa:
- que cada bloque obligatorio venga una vez: `title`, `short_name`, `short_description`, `offer_line`, `how_it_works`, `shipping_payment`, `seo_title` y `seo_description`;
- que `benefit` venga de 3 a 5 veces y `faq`, de 3 a 6;
- los largos de la tabla del §2;
- que no haya `guarantee` si `guarantee_days` es null o 0, y que sí venga si es mayor que 0;
- los precios: todo monto con el símbolo de la moneda debe ser el precio, el precio antes, el precio de un pack o su ahorro;
- las promesas prohibidas que se pueden detectar con seguridad («cura», «resultados garantizados»); el resto de la salud y los `forbidden_claims` de la ficha quedan en el prompt, porque «elimina» o «se trata de» son legítimos en muchos productos;
- que haya al menos una pregunta sobre el pago contra entrega o la compra online.

Con problemas se reintenta una vez, con `copyUser(ctx, problems)`. Si falla otra vez, `error_code = "invalid_output"` y el mensaje «La IA escribió textos que no cumplen las reglas. Toca Reintentar.».

---

## 4. Datos (migración `20261001000000_page_copy.sql`)

> Implementado con dos cambios: `content_items` suma `missing` (el dato que la IA no tiene, que el diseño muestra como aviso) y `merchant_settings` suma `free_shipping`.

```sql
create table public.copy_runs (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  status          pipeline_run_status not null default 'queued',
  error_code      text,
  error_message   text,
  input           jsonb not null,        -- avatar_id, brief ids (principal y secundario), snapshot de precio, keys a rehacer
  payload         jsonb,                 -- salida del modelo
  prompt_version  smallint not null,
  model           text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table public.content_items (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  run_id       uuid not null references public.copy_runs on delete cascade,
  key          text not null,           -- PAGE_BLOCKS o 'faq'
  position     smallint not null,       -- orden en la página
  original     text,                    -- lo que hay hoy en Shopify
  proposal     text not null,           -- lo que escribió la IA (faq: «pregunta\n\nrespuesta»)
  edited_text  text,                    -- «Guardar y aceptar»
  angle_role   text check (angle_role in ('primary', 'secondary')),
  note         text,
  status       content_status not null default 'generated',
  superseded_at timestamptz,            -- una regeneración lo reemplazó
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index content_items_active on public.content_items (product_id, position) where superseded_at is null;
```

- RLS: «dueño lee» en las dos tablas, y escritura solo con `service_role`, como el resto.
- `docs/esquema-supabase.md` se actualiza: la tabla propuesta allí queda reemplazada por esta.
- **Una regeneración** crea otro `copy_runs` e inserta ítems solo para las `key` que no estaban aprobadas. Los reemplazados quedan con `superseded_at`, y los aprobados se mantienen.
- **Desactualizado:** si los desarrollos aprobados de hoy no son los del `input` del run (se reabrió o regeneró uno), la etapa lo avisa. No se borra nada.

---

## 5. Pipeline y rutas

`lib/pipeline/copy.ts`, con el mismo patrón que `lib/pipeline/angles.ts`:

| Función | Qué hace |
|---|---|
| `loadCopyContext(userId, productId)` | Exige el cliente ideal aprobado, la ficha, el precio y **los 2 desarrollos aprobados**. Si falta algo, `OptimizeError` 409 con qué falta |
| `startCopy(userId, productId, { redo })` | Máximo 20 runs cada 24 horas. Sin `redo`, devuelve el run activo si existe. Con `redo`, crea uno nuevo solo para lo no aprobado. Corre `runCopy` en `after()` |
| `runCopy(runId)` | Llamada, `copyProblems`, un reintento, `logGeneration` y la inserción de los ítems en una transacción |
| `decideItem(userId, itemId, action, text?)` | `approve` (con `text` guarda `edited_text`), `reject` o `reopen` (deshacer) |

| Método y ruta | Qué hace |
|---|---|
| `GET /api/products/[id]/copy` | Estado de la etapa, consultado cada 2,5 s mientras se genera |
| `POST /api/products/[id]/copy` | `{ redo?: boolean }`: escribe o reescribe lo no aprobado |
| `PATCH /api/products/[id]/copy/items/[itemId]` | `{ action: "approve" \| "reject" \| "reopen", text? }` |

Todas devuelven `copyState(userId, id)` desde `lib/data/products.ts`: fase, ítems activos, error, si está desactualizado y los `missing_inputs`.

**Qué significa descartar:**
- en un bloque con original (título, SEO), se mantiene lo que hay en Shopify;
- en uno sin original, el bloque no va en la página;
- los obligatorios sin original (descripción corta, oferta, envío y pago) no se pueden dejar vacíos: la etapa no se completa hasta aprobar una versión, propia o reescrita.

---

## 6. Ruta, Hoy y pantalla

**Fase de la etapa** (`copyPhase` en `lib/products/stages.ts`): `locked` → `start` → `writing` → `failed` → `review` → `done`.
- La etapa está `done` cuando no queda nada pendiente y los obligatorios están aprobados.
- Con Textos `done`, Imágenes pasa a `current`.
- La descripción de la ruta dice «8 de 14 aceptados».

**Hoy** (`lib/data/today.ts`): entrada «Textos listos para revisar» cuando termina la generación y «No se pudieron escribir los textos» si falla.

**Pantalla** (`components/screens/copy.tsx`, `CopyScreen`, que envuelve a `ReviewFlow`):

| Estado | Qué se ve |
|---|---|
| locked | `EmptyState`: «Aprueba los 2 desarrollos de Ángulos», con un enlace |
| start | `EmptyState` con «Escribir textos con IA». El botón «Continuar: Textos» de Ángulos ya lo dispara |
| writing | El `EmptyState` actual, con la consulta de estado |
| failed | Mensaje de error y «Reintentar» |
| review | `ReviewFlow` conectado: `onDecide` llama a `PATCH` y el deshacer usa `reopen`. Cada tarjeta muestra la etiqueta, el `RoleChip` del ángulo, la nota y el contador de caracteres con su límite |
| done | Lista de lo aprobado por sección, más «Rehacer los descartados» y «Continuar: Imágenes» |
| desactualizado | Aviso sobre la lista: «Cambiaste tus ángulos. Reescribe los textos que no aprobaste.» |

- Escritorio: el mismo layout de etapas que Ángulos (columna con `StageList`).
- Vista de desarrollo: `/dev/screens/copy?state=locked|start|writing|failed|review|done|stale`, con un `fixture.ts`.
- `lib/mock/content.ts` se corrige: se quita la garantía inventada y se agregan `key` y `angle_role`.

`ContentItem` en `lib/types.ts` suma `key`, `angle?: AngleRole`, `limit?: number` y `editedText?`.

---

## 7. Fases

| Fase | Qué | Hecho cuando |
|---|---|---|
| F0 | Migración §4 (local y producción) y tipos | Las tablas están en ambas bases |
| F1 | `lib/copy/{schemas,prompts}.ts`, `copyProblems` y sus tests (tamaño del esquema, cada regla, el prompt de reintento) | Tests en verde |
| F2 | `lib/pipeline/copy.ts`, las rutas, los límites y la detección de desactualizado | Las rutas responden contra la base local |
| F3 | `getProductContent` y `copyState` reales, `copyPhase`, la ruta del producto, Hoy y `NextAction` | La ruta muestra Textos con su estado real |
| F4 | `CopyScreen`, la conexión de `ReviewFlow`, la vista de desarrollo y el botón de Ángulos | Todos los estados revisados en el navegador, en móvil y escritorio |
| F5 | `docs/pipeline-ia.md` (sección Textos), `CLAUDE.md` y `docs/esquema-supabase.md` | typecheck, lint, test, `check:valores` y build en verde |
| F6 | Prueba con la IA real en 3 o 4 productos | Textos útiles sin reescribir más de 2 bloques por producto |

**Fuera de alcance:** Publicar en Shopify (la plantilla HTML y la mutación `productUpdate`), las imágenes, el copywriter de anuncios, la regeneración de un solo bloque y la vista previa de la página.

---

## 8. Decisiones abiertas

1. **Confirmar que Textos es la página del producto.** Así la describen la app, `docs/pipeline-ia.md` y la ruta, que dice «Publicar en tu tienda: necesita textos e imágenes». Es el redactor de página que antes quedó en espera.
2. **Datos de envío de la tienda.** El bloque «Envío y pago» necesita saber si el envío es gratis, el plazo real de entrega y el WhatsApp, y hoy no se guardan. Hay dos opciones:
   - **(a)** agregar esos 3 campos a `merchant_settings`, con un formulario pequeño en Ajustes. También los va a usar el copywriter;
   - **(b)** que el bloque diga solo «Pago contra entrega» y pida el resto en `missing_inputs`, para que el comerciante lo complete al editar.

   Recomiendo **(b)** para este incremento y **(a)** antes del copywriter.
3. **SEO y nombre corto.** ¿Se incluyen desde ya? Suben 3 bloques más para revisar, pero Publicar y los anuncios los usan.
4. **La prueba de F6.** El criterio «no más de 2 bloques reescritos por producto» es una propuesta. Ajústalo si prefieres otro.
