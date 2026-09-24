# Spec: Anuncios en Meta y motor de decisión (v2)

> Estado: **propuesta**, sin implementar.
> Fecha: 2026-09-23.
> Fuentes de negocio:
> - `dropflex/docs/analisis-unificacion-abo-cbo.md`: dos bases, ABO y CBO, con presets.
> - `dropflex/docs/analisis-mentoria-impulso-pro.md` §6–§12 y el plan personal (PDF): el testeo ABO por defecto.
> - `analisis-curso-tfl.md`, `analisis-curso-gem.md` y `PanchoDrops.md`: los demás presets.
>
> Diseño: `design-system/anuncios.md` + PantallasAnuncios1/2 y PantallasAnunciosEscritorio1/2 (artifact DropFlex).
> Código de origen: `dropflex/lib/ads/*` (Graph API v21.0), mapeado en §9.

## 0. Resumen

La etapa **Anuncios** lanza una campaña de Meta para un producto y la sigue con un **motor de decisión** que dice cuándo esperar, pausar o escalar.

1. **Dos estructuras, nada más:** ABO (el presupuesto vive en cada conjunto) y CBO (vive en la campaña). Lo que hoy separa a TFL, GEM, PanchoDrops e Impulso son números y reglas de armado, así que pasan a ser **plantillas**.
2. **Las plantillas precargan, no mandan.** Una plantilla llena todos los valores de lanzamiento y de reglas. Después, cada valor se edita en la campaña. Si la configuración cambió, se puede guardar como plantilla propia.
3. **Todo vive en la campaña.** La configuración de lanzamiento, el modo del motor (recomendar o automático), las reglas con sus valores y el CPA límite se guardan **en cada campaña**. No hay configuración global de motor: cambiar una campaña no toca las demás. Las plantillas solo sirven para crear.
4. **Métricas cada 1 hora, con historial.** Un job de Supabase (`pg_cron` + `pg_net`) llama cada hora a `/api/cron/ads-sync`. Se guarda cada lectura: se agrega una fila por lectura horaria y el día se reescribe mientras Meta asienta las conversiones. Con eso se dibujan gráficos de evolución.
5. **Plantilla por defecto: Testeo ABO al estilo Impulso Pro.** Son 2 conjuntos abiertos, un creativo y un anuncio por conjunto, $5.000 CLP por conjunto, inicio a las 06:00 del día siguiente y reglas por CPA contra el CPA máximo del producto.
6. **Se crea en pausa y se publica aparte.** Nada gasta dinero sin el toque del comerciante. El modo automático aplica cambios solo dentro de topes, con registro y "Deshacer".

**Primer corte (decidido):** lanzar ABO y CBO, las plantillas del sistema y las propias, el motor con modo recomendar y modo automático, **CBO desde ganadores**, y los gráficos de evolución.

---

## 1. Qué hay hoy en v2

| Pieza | Dónde | Hoy |
|---|---|---|
| Conexión con Meta | `lib/integrations/meta/*`, `meta_connections` | OAuth con `ads_management`, `ads_read`, `business_management` y `pages_show_list`; token en Vault (`metaToken`); cuenta, página y pixel elegidos; cliente `graphGet`/`graphList` solo de lectura |
| Etapa Anuncios | `lib/products/stages.ts` | Siempre `locked` ("Usa los ángulos elegidos"); no hay pantalla |
| Campañas | `/campaigns`, `/campaigns/[id]`, `lib/data/campaigns.ts` | Datos de ejemplo (`lib/mock/campaigns.ts`) |
| Hoy | `lib/data/today.ts` | Las entradas de campañas son de ejemplo |
| Crons | `vercel.json` | Solo `/api/cron/connections`, 1 vez al día, con `Bearer CRON_SECRET` |
| CPA límite | `product_pricing` | `purchase_cost_limit` (lo escribe el comerciante) y `max_cpa` (equilibrio calculado) |
| Textos | `content_items` + `angle_briefs` | La página aprobada y los 2 desarrollos (ganchos, objeciones, oferta) |
| Color | `products.page_accent_color` | No se usa en anuncios |
| Gráficos | — | No hay librería de gráficos |

---

## 2. Dónde vive cada cosa (`design-system/anuncios.md`)

- **Lanzar:** en la etapa Anuncios del producto, `/products/[id]/ads` (clave `anuncios`). Se habilita con la **página del producto lista** (`copyPhase === "done"`) y Meta conectado con cuenta, página y pixel. Es opcional y no bloquea Publicar.
- **Seguir:** en Campañas → `/campaigns/[id]`. Muestra las decisiones del motor por conjunto o anuncio (`DecisionRow`), las reglas activas, las cifras y los gráficos.
- **Decisiones pendientes:** aparecen en **Hoy** (`AttentionItem`) y en la tarjeta de campaña (`CampaignCard`).
- **Plantillas propias:** en Ajustes › Plantillas de campaña (duplicar, renombrar, borrar).

---

## 3. Parámetros comunes (fijos, no se muestran)

Coinciden en todas las fuentes (análisis §2). Si alguno cambia, cambia para las dos bases.

| # | Parámetro | Valor |
|---|---|---|
| C1 | Objetivo | `OUTCOME_SALES` |
| C2 | Optimización | `OFFSITE_CONVERSIONS` (maximizar el número de conversiones) |
| C3 | Evento | `PURCHASE` en el pixel elegido |
| C4 | Puja | `LOWEST_COST_WITHOUT_CAP` |
| C5 | Facturación | `IMPRESSIONS` |
| C6 | Categorías especiales | `[]` |
| C7 | Estado al crear | `PAUSED` en los tres niveles; "Publicar" los activa |
| C9 | Identidad | Página de Facebook elegida |
| C10 | Botón | `SHOP_NOW` ("Comprar") |
| C11 | Ubicaciones | Automáticas (no se envía `publisher_platforms`) |
| C12 | Destino | `https://<shop_domain>/products/<handle>` |
| C13 | Público abierto | Al menos un conjunto abierto (`advantage_audience: 1`) |
| C14 | Campañas por producto | Una campaña de testeo activa por producto; la CBO de ganadores es otra |
| C15 | Techo de escalado | Máximo **+30 %** por paso (`MAX_SCALE_STEP_PCT`) |
| C17 | Atribución | `attribution_spec` explícito: 7 días clic + 1 día vista (análisis §10) |
| C18 | UTM | `url_tags`: `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}` |

`is_dynamic_creative` se envía **solo** si el anuncio lleva más de una variante de texto o de medio (CBO `oneDco`). Así se corrige el riesgo R1 del análisis.

---

## 4. Plantillas

Una plantilla es `{ structure, launch, engine }`: la estructura, los valores de lanzamiento y los del motor. Las del sistema viven en código (`lib/ads/presets.ts`) y las propias en `ad_templates`. Aplicar una plantilla **copia** sus valores en la campaña; desde ahí, la campaña es dueña de su configuración.

### 4.1 Plantillas del sistema

| Clave | Nombre en la UI | Estructura | Lanzamiento | Motor |
|---|---|---|---|---|
| `impulso` **(por defecto)** | Testeo ABO · 1 creativo por conjunto | ABO | 2 conjuntos abiertos; 1 anuncio y 1 creativo por conjunto; $5.000 por conjunto; edad de Meta (18); Chile; inicio 06:00 del día siguiente; textos distintos por conjunto | Reglas Impulso (§5.3) |
| `gem` | Testeo ABO · con intereses | ABO | 4 conjuntos (2 abiertos + 2 con intereses); $5.000 por conjunto; edad 35+; 06:00 | Reglas Impulso con esperar 3 días |
| `pancho` | Testeo ABO · muchos videos | ABO | 6 conjuntos (máximo 9); solo video; $2.000 por conjunto; excluye Arica, Aysén y Magallanes; 05:00; texto general | Reglas de intención (§5.3, variante) |
| `tfl` | Testeo CBO · TFL | CBO | 1 abierto + 2 con intereses; 1 anuncio DCO con hasta 6 medios; US$5/día en la campaña; edad 23+; 06:00 | Reglas por CPA equivalentes al ROAS/BEROAS de TFL |
| `cbo-winners` | Escalado CBO · ganadores | CBO | Creativos de los conjuntos ganadores de una ABO; $40.000/día (rango 30–50 mil); 1 conjunto abierto | No tocar 72 h; después, pausar y escalar por CPA |

- **Montos en otras monedas.** Los montos en CLP se convierten a la moneda de la cuenta al aplicar la plantilla (tabla fija en `lib/ads/currency.ts`, redondeada por moneda, como `roundingFor`). Quedan editables.
- **Por qué Impulso por defecto.** Tres de las cuatro fuentes testean en ABO, e Impulso lo argumenta: en CBO "Meta le va a asignar presupuesto a solo uno". TFL queda como plantilla CBO; el análisis registra esa desviación como R0.

### 4.2 Plantillas propias

- **Guardar.** Con cambios sobre la plantilla, aparece "N cambios · Restablecer · Guardar como plantilla" (`PresetSelect`). Se guarda en `ad_templates` con el nombre que elija el comerciante.
- **En Ajustes:** duplicar, renombrar y borrar. Borrar una plantilla no toca las campañas que la usaron, porque cada campaña tiene su copia.

---

## 5. El motor de decisión

### 5.1 Modelo de reglas

Las reglas son **tipos fijos con parámetros**, no un lenguaje libre. Así la UI las escribe como frases con valores editables en línea (`RuleRow`) y el código las evalúa sin ambigüedad. Los montos van como **múltiplos del CPA límite** de la campaña ("1,5×"): si el límite cambia, las reglas se ajustan solas.

```ts
type RuleGroup = "wait" | "pause" | "scale";
type Rule =
  | { id; group: "wait";  type: "min_spend";        enabled; spendX: number; orHours: number }          // no decidir antes de gastar X× el CPA o de N h
  | { id; group: "wait";  type: "after_change";     enabled; hours: number }                          // tras editar/escalar, esperar N h
  | { id; group: "wait";  type: "min_days";         enabled; days: number }                           // días completos antes de pausar/escalar
  | { id; group: "pause"; type: "no_sales";         enabled; spendX: number }                         // gastó X× el CPA sin ventas
  | { id; group: "pause"; type: "cpa_over";         enabled; cpaX: number; days: number }             // CPA promedio > X× por N días (nunca un día)
  | { id; group: "pause"; type: "low_ctr";          enabled; ctrPct: number; minImpressions: number } // señal temprana, solo sin ventas
  | { id; group: "pause"; type: "intent_expired";   enabled; hours: number }                          // pagos iniciados sin compra tras N h (Pancho)
  | { id; group: "scale"; type: "cpa_under";        enabled; cpaX: number; days: number; minSales: number; stepPct: number; everyHours: number }
  | { id; group: "scale"; type: "daily_cap";        enabled; amount: number }                         // nunca pasar de $X diarios (campaña)
  | { id; group: "scale"; type: "winners_to_cbo";   enabled; minWinners: number; cbodBudget: number };// sugiere crear la CBO de ganadores
```

**Validación (zod, en el servidor):**
- `stepPct` como máximo 30 (C15);
- los múltiplos entre 0,1 y 10;
- las horas entre 1 y 336;
- `daily_cap` mayor o igual que el presupuesto actual.

### 5.2 Evaluación

La evaluación corre cada hora, después de leer las métricas, sobre cada **unidad**: en ABO, cada conjunto; en CBO, cada anuncio para pausar y la campaña para escalar (tabla "Nivel según estructura" del diseño).

1. **Esperar manda.** Si una regla de espera no se cumple, la unidad queda en `wait`. El progreso se muestra como barra: "Falta gastar $2.300 para decidir (62 % de 1× CPA)".
2. **Pausar.** La primera regla de pausa que se cumple gana → `pause`.
3. **Escalar.** Si se cumple `cpa_under` → `scale` al presupuesto `min(actual × (1 + step), tope)`. Si ya está en el tope → `keep` ("en el tope diario").
4. **Si nada aplica** → `keep` ("Mantener").
5. **Ganadores.** `winners_to_cbo` se evalúa a nivel de campaña ABO. Con `minWinners` conjuntos que cumplen `cpa_under`, sugiere "Crear CBO con N ganadores".

**Sobre qué se calcula:**
- las ventas son las compras con atribución de 7 días clic y 1 día vista;
- el CPA es gasto dividido por compras;
- las ventanas de "N días" usan los días del historial diario (§6), en la zona horaria de la cuenta.

**La decisión se guarda** en `ad_decisions` (solo se agregan filas) con:
- la unidad;
- el veredicto;
- la regla que la disparó y su texto;
- las cifras usadas;
- el presupuesto sugerido.

Una decisión igual a la anterior de la misma unidad no crea otra fila: actualiza `last_seen_at`.

### 5.3 Valores de las plantillas (del material)

**Impulso** (análisis Impulso §8 y §12). "CPA" es el CPA límite de la campaña; por defecto, el `max_cpa` del producto (la fórmula de la planilla de costeo, `purchase_cost_limit` si no hay). Así se ven las reglas:

| Grupo | Regla | Valor por defecto | Fuente |
|---|---|---|---|
| Esperar | No decidir antes de gastar | **1×** el CPA **o** 24 h | R1, R2, R21 |
| Esperar | Tras editar o escalar, esperar | **72 h** | R20, R29 ("3 días de estabilización") |
| Pausar | Gastó sin ventas | **1×** el CPA | R2 ("se gastó las cinco lucas sin venta") |
| Pausar | CPA promedio mayor al límite | **1×** por **3 días** | R11, R15, R16 ("nunca por un día malo") |
| Pausar | CTR bajo, sin ventas | < **1 %** tras **1.000** impresiones · **apagada** | R9 (choca con R8) |
| Escalar | CPA bajo | **≤ 0,7×** por **3 días**, **≥ 2 ventas**, **+20 %** cada **72 h** | R25, R26, R29 (CPA bueno $1–3,5 frente a malo > $6 ≈ 0,6×) |
| Escalar | Tope diario | **6×** el presupuesto inicial total | Ninguna fuente lo define; valor de producto, editable |
| Escalar | Ganadores → CBO | **3** conjuntos ganadores, **$40.000/día** | R31 |

- **`pancho`:** cambia `min_spend` a 6 h y agrega `intent_expired` de 24 h. Los umbrales de CPC y CTR de `PANCHO_THRESHOLDS` van en CLP y se convierten.
- **`tfl`:** traduce "ROAS < BEROAS" a "CPA > 1× el CPA de equilibrio". Espera US$10 de gasto (convertidos) y escala +25 % cada 72 h.
- **`cbo-winners`:** espera `min_days = 3` ("no tocar 2–3 días") y luego aplica las reglas Impulso a nivel de campaña.

**Surfing** (R36–R41) exige a una persona mirando todo el día (`[HUMANA OBLIGATORIA]`): queda fuera.

### 5.4 Modos

El modo se elige **por campaña** (`SegmentedControl` "Cómo actúa").

- **Solo recomendar (por defecto).** `pause` y `scale` quedan `pending`. `DecisionRow` ofrece la acción ("Pausar conjunto", "Subir a $12.000") y la alternativa ("Mantener", "Ignorar"). Nada cambia en Meta sin ese toque.
- **Automático.** Activarlo pide confirmación y muestra el tope diario.
  - El motor aplica `pause` y `scale` dentro de los topes: C15, `daily_cap`, y nunca dos cambios a la misma unidad dentro de `after_change`.
  - Cada cambio queda en `ad_changes` con la hora, la regla, el valor anterior y el nuevo, y se puede **Deshacer** (volver al presupuesto anterior) o **Reactivar**.
  - `winners_to_cbo` **nunca** se aplica solo: crear una campaña nueva siempre pide el toque del comerciante.
- **Topes que el modo automático nunca supera:**
  - el `daily_cap` de la campaña;
  - un paso de +30 %;
  - una acción por unidad cada `after_change`;
  - si Meta rechaza un cambio, la campaña vuelve a "Solo recomendar" y avisa en Hoy.

---

## 6. Métricas cada hora e historial

**El job.** `pg_cron` ejecuta `ads-sync-hourly` a los minutos 5 de cada hora y llama `net.http_get` a `/api/cron/ads-sync`, con `Authorization: Bearer <cron_secret>`. La URL y el secreto se leen de **Supabase Vault** (`app_base_url`, `cron_secret`), así no quedan escritos en la migración (riesgo 9 del mapeo).

**Qué hace `runAdsSync`**, por cada campaña `active` o `paused` con menos de 30 días desde la última entrega:
1. Lee insights de Meta por **campaña, conjunto y anuncio** para **hoy y ayer**, con `time_increment=1` en la zona de la cuenta y los campos de §6.1.
2. **Reescribe el día** en `ad_insights_daily`. Una fila por unidad y día; ayer se sigue reescribiendo hasta 72 h después, porque Meta asienta conversiones tarde.
3. **Agrega una foto** en `ad_insights_snapshots`: una fila por unidad y hora, con lo acumulado del día y de la vida. **Nunca se borra ni se pisa**: es el historial para los gráficos.
4. Refresca el estado y el presupuesto reales desde Meta (`effective_status`, `daily_budget`) en `ad_sets`, `ads` y `ad_campaigns`. Si alguien los cambió en Meta, DropFlex lo refleja y lo anota.
5. Evalúa el motor (§5.2) y, en modo automático, aplica.
6. Deja la hora y el error en `ad_campaigns.last_synced_at` y `sync_error`.

**Reglas del job:**
- Corre en lotes de 10 campañas por llamada y sigue en la próxima si se acaba el tiempo (`maxDuration` 300).
- Respeta el throttling de Meta con el cliente portado (§9): reintentos con espera, y códigos 4, 17, 32, 613 y 80004.
- Una campaña con token vencido marca la conexión en `error`, como el cron diario actual.

**"Actualizar ahora"** en el detalle de la campaña ejecuta la misma lectura para esa campaña, con un tope de 1 vez cada 5 minutos.

### 6.1 Métricas guardadas

| Campo | Cómo sale |
|---|---|
| `spend` | Gasto (moneda de la cuenta) |
| `impressions`, `reach`, `frequency` | Insights |
| `clicks` (enlace), `ctr`, `cpc`, `cpm` | `inline_link_clicks`, `inline_link_click_ctr`, `cost_per_inline_link_click`, `cpm` |
| `purchases`, `purchase_value` | Acción `omni_purchase` y su valor |
| `initiated_checkouts` | El máximo entre las familias InitiateCheckout y AddPaymentInfo (lógica de `mappers.ts`, sin sumar alias) |
| `cpa`, `roas` | Calculados: gasto / compras y valor / gasto |

### 6.2 Gráficos (detalle de la campaña)

- **Evolución diaria:** gasto, ventas y CPA contra la línea del CPA límite, en 7, 14 y 30 días o toda la vida. Selector de métrica: CPA, ventas, gasto, CTR, CPC, CPM y ROAS. Por campaña, o por conjunto o anuncio al tocar una fila.
- **Hoy, hora a hora:** una curva acumulada desde `ad_insights_snapshots`, que muestra cómo va el día frente a ayer.
- **Implementación:** el gráfico del kit de shadcn (Recharts) con los tokens `chart-1…5` (costos en grises, ganancia en `chart-4`). La línea del límite es punteada, y el color no es la única señal: la leyenda nombra cada serie.

---

## 7. Lanzar (configurador)

### 7.1 Pantalla (`/products/[id]/ads`)

Sigue PantallasAnuncios1 y PantallasAnunciosEscritorio1.

1. **`StructurePicker`:** ABO o CBO. Cambiar de estructura con cambios hechos pide confirmación y dice qué se conserva (creativos, textos, público) y qué se reemplaza (presupuesto y reglas).
2. **`PresetSelect`:** las plantillas del sistema y las propias, filtradas por estructura. Muestra el contador de cambios, "Restablecer" y "Guardar como plantilla".
3. **`ConfigSection` ×5**, cada una con su resumen de una línea:
   - **Creativos:** `CreativeSlot` + `ImageUploader` con imagen y video. En ABO, cada creativo crea su conjunto; en CBO, van como anuncios.
   - **Público:** países (`ChipInput`), regiones excluidas, ubicación (vive o estuvo), edad mínima, y público abierto o intereses. Los intereses se buscan en Meta con `searchInterests`.
   - **Presupuesto y horario:** el presupuesto va en cada conjunto (ABO) o en la campaña (CBO). Muestra la puja "Menor costo", el inicio (mañana a las 06:00 en la hora de la cuenta) y el total diario.
   - **Textos del anuncio:** textos principales, títulos, descripción, URL y botón.
   - **Motor de decisión:** el modo y las reglas (`RuleGroup` + `RuleRow`), con el CPA límite visible y editable.
4. **`CampaignTree`:** a la derecha en escritorio y en "Revisar y lanzar" en móvil.
5. **Revisar y lanzar** → "Crear en pausa". El resultado se ve en la misma pantalla y lleva a `/campaigns/[id]`, donde está "Publicar".

"Guardar borrador" guarda la campaña en estado `draft`, con su configuración.

### 7.2 Creativos

- **Carga.** Se suben a un bucket privado nuevo, `ad-media`, bajo `<user_id>/<product_id>/`, con URL firmada: el mismo flujo que las imágenes de referencia.
- **Formatos.** Imagen JPG o PNG hasta 30 MB; video MP4 o MOV hasta 1 GB; proporción 1:1, 4:5 o 9:16. Una imagen WebP se convierte a JPG antes de subirla a Meta.
- **Subida a Meta** (al lanzar):
  - imagen: `POST /adimages` con bytes;
  - video: `POST /advideos` con `file_url` firmado de 1 h, y espera a `ready` con los reintentos de `adapter.ts`. La miniatura se sube como `adimages`.
  - El resultado se cachea en `ad_media` (`meta_image_hash`, `meta_video_id`, `thumbnail_hash`) para reusarlo.
- **Estados de `CreativeSlot`:** subiendo, procesando, listo o error, con el motivo.

### 7.3 Textos por defecto

Salen de lo aprobado, así que no hace falta otra llamada a la IA. Todos son editables.

| Campo | Por defecto |
|---|---|
| Textos principales (hasta 5) | El gancho recomendado de cada desarrollo aprobado + la frase de la oferta + "Paga al recibir" |
| Títulos (hasta 5) | El nombre corto y la frase de la oferta de la página |
| Descripción | El bloque de envío y pago, recortado a 30 caracteres ("Envío gratis · Paga al recibir") |
| En ABO | Cada conjunto toma un texto principal distinto, en orden (Impulso: "cambiando video y copy") |

El copywriter de anuncios (`agentes-creativos 4/copywriter.md`) se integra después. Su lugar es este mismo campo.

### 7.4 Orden de creación y reversión

Se crea en este orden: campaña → subida de medios → creativos → por cada conjunto, el conjunto y sus anuncios.

- **Si falla cualquier paso**, se borra (`DELETED`) todo lo creado en Meta, en orden inverso. La campaña local queda `failed` con el motivo y "Reintentar". Así se corrige el riesgo 2 del mapeo (objetos huérfanos).
- **Idempotencia:** un lanzamiento en curso por campaña (índice único), como en Ángulos.
- **Techo de gasto:** el total diario comprometido (en ABO, conjuntos × presupuesto) debe caber en el **tope de gasto diario de la cuenta**. Es un valor nuevo en Ajustes, sin valor por defecto: si falta, se pide antes de lanzar. Corrige el riesgo R3 del análisis (el techo fijo de US$20).
- **Publicar:** activa campaña → conjuntos → anuncios. Si algo falla a mitad, reintenta lo que quedó en pausa y lo dice.

---

## 8. Datos (migración `20261003000000_ads.sql`)

```sql
create type public.ad_structure as enum ('abo', 'cbo');
create type public.ad_campaign_status as enum ('draft', 'launching', 'paused', 'active', 'failed', 'archived');
create type public.ad_verdict as enum ('wait', 'keep', 'pause', 'scale', 'winners');

-- Plantillas propias del comerciante (las del sistema viven en lib/ads/presets.ts).
create table public.ad_templates (
  id uuid pk, user_id fk, name text, structure ad_structure,
  launch jsonb, engine jsonb, based_on text, created_at, updated_at
);

-- Una campaña: su configuración de lanzamiento y la de su motor son SUYAS.
create table public.ad_campaigns (
  id uuid pk, user_id fk, product_id fk → products on delete cascade,
  ad_account_id text, meta_campaign_id text unique,
  name text, structure ad_structure, template_key text, template_id uuid null,
  status ad_campaign_status, launch jsonb,           -- público, presupuesto, horario, textos, creativos (validado con zod)
  engine jsonb,                                      -- { mode: 'suggest'|'auto', cpa_limit, rules[] }
  daily_budget numeric null,                         -- CBO
  currency char(3), timezone text,
  source_campaign_id uuid null,                      -- la ABO de la que salió una CBO de ganadores
  error text, launched_at, published_at, last_synced_at, sync_error, created_at, updated_at
);
create table public.ad_sets (
  id uuid pk, campaign_id fk cascade, meta_adset_id text, name, position,
  audience jsonb, daily_budget numeric null, status text, last_changed_at, created_at, updated_at
);
create table public.ads (
  id uuid pk, adset_id fk cascade, campaign_id fk cascade, meta_ad_id text, meta_creative_id text,
  name, media_id fk → ad_media, copy jsonb, status text, created_at, updated_at
);
create table public.ad_media (
  id uuid pk, user_id, product_id fk cascade, kind text check (kind in ('image','video')),
  storage_path text, ratio text, duration_s numeric, size_bytes bigint,
  ad_account_id text, meta_image_hash text, meta_video_id text, thumbnail_hash text,
  status text check (status in ('uploading','ready','processing','error')), error text, created_at
);

-- Métricas: el día (se reescribe mientras Meta asienta) y la foto horaria (solo se agrega).
create table public.ad_insights_daily (
  campaign_id fk cascade, level text check (level in ('campaign','adset','ad')), unit_id uuid,
  date date, spend, impressions, reach, clicks, purchases, purchase_value, initiated_checkouts,
  ctr, cpc, cpm, cpa, roas, updated_at,
  primary key (unit_id, date)
);
create table public.ad_insights_snapshots (
  id bigserial pk, campaign_id fk cascade, level text, unit_id uuid, captured_at timestamptz,
  date date, today jsonb, lifetime jsonb             -- mismas métricas, acumuladas
);
create index on public.ad_insights_snapshots (unit_id, captured_at desc);

-- El motor: cada decisión (solo se agregan filas) y cada cambio aplicado (con deshacer).
create table public.ad_decisions (
  id uuid pk, campaign_id fk cascade, level text, unit_id uuid, verdict ad_verdict,
  rule_id text, reason text, metrics jsonb, suggested_budget numeric null,
  disposition text check (disposition in ('pending','applied','auto_applied','ignored','expired','undone')),
  first_seen_at, last_seen_at, decided_at, decided_by text
);
create table public.ad_changes (
  id uuid pk, campaign_id fk cascade, unit_id uuid, level text, action text,  -- pause | resume | set_budget | publish | create
  before jsonb, after jsonb, decision_id uuid null, actor text,              -- 'merchant' | 'engine'
  undone_at timestamptz null, created_at
);

alter table public.merchant_settings add column ad_daily_spend_cap numeric;   -- tope de gasto diario de la cuenta
```

- **Acceso:** RLS "dueño lee" en todas las tablas; escritura solo con `service_role`.
- **Borrado del producto:** todo cuelga de `products` con `on delete cascade`, y el bucket `ad-media` se agrega a `deleteProducts`, como exige CLAUDE.md. Borrar el producto **no** borra la campaña en Meta: el paso de borrado la pausa antes.
- **Cron:** la migración también crea el job de `pg_cron` y los secretos de Vault (§6). Los valores de Vault se cargan a mano: `app_base_url` y `cron_secret`.

---

## 9. Qué se porta de `dropflex/lib/ads`

| Pieza de origen | Destino en v2 | Cambios |
|---|---|---|
| `meta/client.ts` (reintentos, mapeo de errores) | `lib/integrations/meta/client.ts` (ampliar) | Agregar `graphPost` con los reintentos y las clases de error; mantener `appsecret_proof` |
| `meta/adapter.ts` (crear y editar campaña, conjunto, creativo y anuncio; subir imagen y video; `getCampaignTree`; `searchInterests`; regiones) | `lib/ads/meta/adapter.ts` | `is_dynamic_creative` solo con más de una variante; `attribution_spec` y `url_tags` explícitos; **agregar lectura de insights por anuncio** |
| `meta/mappers.ts` (compras, pagos iniciados, CPA) | `lib/ads/meta/insights.ts` | Tal cual, con sus tests |
| `meta/creative.ts` | `lib/ads/meta/creative.ts` | DCO solo en CBO `oneDco`; un medio y un texto por anuncio en ABO |
| `meta/currency.ts` (unidades mínimas) | `lib/ads/currency.ts` | Tal cual; más la tabla CLP → otras monedas para las plantillas |
| `launch/schedule.ts` | `lib/ads/schedule.ts` | **La hora local de la cuenta** (`timezone_name`), no UTC fija (R6) |
| `launch/launcher.ts` | `lib/pipeline/ads-launch.ts` | Reversión total (§7.4); sin `origin`, sin `mode_override` |
| `rules.ts`, `pancho/rules.ts`, `execute.ts` | `lib/ads/engine.ts` (puro) + `lib/pipeline/ads-engine.ts` | Un solo evaluador de reglas tipadas (§5); la configuración sale de la campaña; ABO escala por conjunto (se elimina el riesgo 1 del mapeo) |
| `pancho/reallocation.ts` | — | Fuera del primer corte |
| Tests: `mappers`, `creative`, `schedule`, `rules`, `pancho/rules`, `execute`, `blueprint` | `lib/ads/*.test.ts` | Adaptados al modelo nuevo |

---

## 10. Rutas

| Método y ruta | Qué hace |
|---|---|
| `GET/PUT /api/products/[id]/ads/draft` | Lee o guarda el borrador de la campaña (configuración) |
| `POST /api/products/[id]/ads/media/upload-url` · `POST …/media` | Sube un creativo |
| `GET /api/ads/interests?q=` · `GET /api/ads/regions?country=` | Búsqueda en el catálogo de Meta (`ChipInput`) |
| `POST /api/products/[id]/ads/launch` | Crea en pausa (en segundo plano con `after()`, con sondeo) |
| `POST /api/campaigns/[id]/publish` | Activa campaña → conjuntos → anuncios |
| `PUT /api/campaigns/[id]/engine` | Modo, CPA límite y reglas de **esta** campaña |
| `POST /api/campaigns/[id]/decisions/[decisionId]` | `{ action: "apply" \| "ignore" }` |
| `POST /api/campaigns/[id]/changes/[changeId]/undo` | Deshacer un cambio del motor o del comerciante |
| `POST /api/campaigns/[id]/units/[unitId]` | Pausar, reactivar o fijar presupuesto a mano |
| `POST /api/campaigns/[id]/winners` | Crea la CBO de ganadores (borrador precargado) |
| `POST /api/campaigns/[id]/sync` | "Actualizar ahora" |
| `GET /api/campaigns/[id]/insights?level&unit&range` | Series para los gráficos |
| `GET/POST/PATCH/DELETE /api/ad-templates` | Plantillas propias |
| `GET /api/cron/ads-sync` | Job horario (Bearer `CRON_SECRET`) |

---

## 11. Pantallas

| Pantalla | Diseño | Contenido |
|---|---|---|
| `/products/[id]/ads` | PantallasAnuncios1 L1–L3, Escritorio1 | Configurador (§7), motor dentro de la sección 5 |
| `/campaigns` | Movil3 / Escritorio2 (`CampaignCard`) | Campañas reales. Veredicto de la campaña a partir de sus decisiones: `aprendiendo` si todas esperan, `subir` si hay escalar, `apagar` si hay pausar, `seguir` en otro caso |
| `/campaigns/[id]` | PantallasAnuncios2 L4, AnunciosEscritorio2 | Decisiones por unidad (`DecisionRow`), reglas activas (editables), modo, métricas (`MetricGrid`), gráficos (§6.2), historial de cambios con Deshacer, "Publicar", "Actualizar ahora" |
| Ajustes › Plantillas de campaña | anuncios.md | Lista, renombrar, duplicar, borrar; tope de gasto diario |
| Hoy | `AttentionItem` | Decisiones pendientes (pausar o escalar), campañas con error, cambios automáticos del día |

Componentes nuevos en `components/df`, portados de `design-system/reference` al sincronizarlo con el artifact: `StructurePicker`, `PresetSelect`, `ConfigSection`, `ChipInput`, `RuleRow`, `RuleGroup`, `CreativeSlot`, `CampaignTree` y `DecisionRow`. `CampaignCard`, `Metric` y `AttentionItem` ya existen.

---

## 12. Fases

| Fase | Qué | Hecho cuando |
|---|---|---|
| F0 | Migración §8, bucket `ad-media`, job `pg_cron` y secretos de Vault; `db push` | Tablas en local y producción |
| F1 | Cliente de escritura, adapter, insights, currency, schedule y creative portados, con tests | Tests en verde; una lectura real de insights en la cuenta de prueba |
| F2 | Plantillas y modelo de reglas (`lib/ads/presets.ts`, `engine.ts` puro, zod), con tests por regla | La evaluación de cada regla probada con casos del material |
| F3 | Configurador `/products/[id]/ads` con los 9 componentes nuevos, borrador, carga de creativos, textos por defecto y `CampaignTree` | Estados revisados en el navegador, móvil y escritorio |
| F4 | Lanzar, con reversión, y Publicar | Una campaña creada en pausa en la cuenta de prueba y borrada con la reversión forzada |
| F5 | Job horario: lectura, historial, estado real y motor (recomendar) | Filas en `ad_insights_snapshots` cada hora; decisiones en `/campaigns/[id]` |
| F6 | Modo automático, cambios con Deshacer, Hoy y `CampaignCard` reales | Un escalado automático y su Deshacer en la cuenta de prueba |
| F7 | Gráficos de evolución y "Actualizar ahora" | Series diarias y horarias con la línea del CPA límite |
| F8 | CBO desde ganadores y plantillas propias (Ajustes) | CBO creada desde 3 conjuntos ganadores |
| F9 | Docs (`CLAUDE.md`, `docs/pipeline-ia.md`), check:a11y y capturas | Verificaciones en verde |

**Riesgo operativo:** F4 a F8 crean objetos reales en Meta y gastan dinero al publicar. Se prueban con una **cuenta publicitaria de prueba** y presupuestos mínimos. El modo automático se prueba primero con topes bajos.

---

## 13. Decisiones

**Tomadas (2026-09-23):**

1. **CPA límite de la campaña:** el `max_cpa` del producto (el equilibrio de la planilla de costeo, como Impulso); si no hay, `purchase_cost_limit`. Se copia en la campaña y se puede editar ahí.
2. **Tope de gasto diario de la cuenta:** es obligatorio. Se pide antes del primer lanzamiento.
3. **No hay cuenta de prueba:** se prueba en la cuenta real de producción.
   - Todo se crea en pausa, y una campaña en pausa no gasta.
   - La reversión se prueba borrando lo creado.
   - Publicar y el modo automático se prueban con el presupuesto mínimo y con autorización explícita en cada prueba.

**Abiertas:**

4. **Creativos:** el diseño los sube en el configurador (§7.2). Falta definir si más adelante también salen de la etapa Imágenes o de un generador de estáticos o videos.
5. **Catálogo Advantage:** propuesta: apagado y fuera de la UI en el primer corte.
