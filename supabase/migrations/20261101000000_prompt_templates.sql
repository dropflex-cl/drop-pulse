-- Prompts en la base (docs/spec-estrategia.md): el texto de cada prompt vive aquí, versionado, y se edita
-- en Ajustes › Prompts (solo admin) sin deploy. Sus campos se llenan con «tags»: textos literales del
-- prompt («[PRECIO]») que el código reemplaza con los datos del producto (lib/prompts/tags.ts).
--   product_data: Información base › «Identificar con IA» (la descripción del producto).
--   strategy:     etapa Estrategia, el mega prompt validado por el comerciante (va tal cual, sin cambios).
create table public.prompt_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null check (key in ('product_data', 'strategy')),
  version     integer not null check (version > 0),
  body        text not null,
  model       text not null default 'claude-opus-5',
  effort      text not null default 'high' check (effort in ('low', 'medium', 'high')),
  max_tokens  integer not null default 16000 check (max_tokens between 1000 and 64000),
  note        text,
  is_active   boolean not null default false,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  unique (key, version)
);
-- Una sola versión activa por prompt.
create unique index prompt_templates_one_active on public.prompt_templates (key) where is_active;

-- Solo el servidor (service_role) los lee y los escribe: el texto no se expone al navegador.
alter table public.prompt_templates enable row level security;

-- Activar una versión: apaga la anterior y prende esta en una sola transacción.
create or replace function public.activate_prompt_template(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select key into v_key from public.prompt_templates where id = p_id;
  if v_key is null then
    raise exception 'prompt_template % no existe', p_id;
  end if;
  update public.prompt_templates set is_active = false where key = v_key and is_active and id <> p_id;
  update public.prompt_templates set is_active = true where id = p_id;
end;
$$;
revoke all on function public.activate_prompt_template(uuid) from public, anon, authenticated;

-- Datos del producto: lo que identifica la IA (o escribe el comerciante) y llena DATOS DEL PRODUCTO.
-- { name, description, source: 'ai' | 'merchant', updated_at, prompt_version, model }
alter table public.products add column product_data jsonb;

-- Una corrida de la estrategia: el informe del mega prompt tal cual (`report`, se va guardando mientras
-- se escribe) y lo que se extrae de él para los pasos siguientes (`extraction`). Al confirmar, los
-- ángulos elegidos se copian a angle_rankings / angle_briefs (lib/pipeline/strategy.ts).
create table public.strategy_runs (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products on delete cascade,
  user_id          uuid not null references auth.users on delete cascade,
  status           public.pipeline_run_status not null default 'queued',
  current_step     text,                                  -- 'report' | 'extract'
  template_id      uuid references public.prompt_templates on delete set null,
  template_version integer,
  input            jsonb not null default '{}',           -- valores de los tags, imagen base, precio y mercado
  report           text,
  extraction       jsonb,
  error_code       text,
  error_message    text,                                  -- en español, para la pantalla
  chosen_slots     smallint[],
  confirmed_at     timestamptz,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index strategy_runs_product on public.strategy_runs (product_id, created_at desc);
-- Una corrida en curso por producto: tocar dos veces no cobra dos veces.
create unique index strategy_runs_one_active on public.strategy_runs (product_id) where status in ('queued', 'running');

alter table public.strategy_runs enable row level security;
create policy "dueño lee" on public.strategy_runs for select using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- Versión 1 de cada prompt

insert into public.prompt_templates (key, version, body, effort, max_tokens, note, is_active) values (
  'product_data', 1, $prompt$Eres el analista de producto de una tienda de dropshipping con pago contra entrega en Latinoamérica. Mira las imágenes del producto (la primera es la imagen principal) y lee lo que el comerciante sabe de él.

PRODUCTO EN SHOPIFY:
[NOMBRE EN SHOPIFY]

LO QUE SABE EL COMERCIANTE (texto del proveedor, notas o la descripción de Shopify):
[INFORMACIÓN DEL COMERCIANTE]

Identifica las características del producto y escribe:
- product_name: el nombre claro y literal del producto (qué es), sin adjetivos de venta.
- description: la descripción del producto para un estratega de ventas, en texto plano, una característica por línea empezando con «- »: qué es, qué incluye, medidas, materiales, colores, cómo se usa, cómo funciona y lo que se ve en las imágenes.

Solo hechos: lo que dice la información o se ve con claridad en las imágenes. No inventes datos, beneficios ni resultados. Si falta un dato importante para venderlo (medidas, contenido, cuánto dura, qué incluye), agrégalo al final en una línea «Falta: …».
Escribe en español neutro.$prompt$, 'low', 4000, 'Versión inicial', true
);

insert into public.prompt_templates (key, version, body, effort, max_tokens, note, is_active) values (
  'strategy', 1, $prompt$Actúa como un estratega senior de ventas directas, psicología del consumidor, AIDA, copywriting de respuesta directa y COD Dropshipping LATAM.

Tu objetivo es analizar un producto y encontrar las mejores oportunidades para venderlo mediante anuncios de Facebook, Instagram y TikTok con pago contra entrega (COD).

DATOS DEL PRODUCTO
Producto:
[ESCRIBE EL NOMBRE DEL PRODUCTO]

Descripción:
[DESCRIPCIÓN O PEGA LA INFORMACIÓN DEL PRODUCTO]

Precio:
[PRECIO]

País objetivo:
[PAÍS]

Costo aproximado:
[COSTO, SI LO CONOCES]

Si adjunto una imagen del producto, úsala también para identificar características, usos y posibles beneficios.

FASE 1 — ANÁLISIS DEL PRODUCTO
Analiza:

Qué problema resuelve.

Qué deseo satisface.

Qué transformación ofrece.

Beneficios funcionales.

Beneficios emocionales.

Qué lo diferencia de alternativas tradicionales.

Qué tipo de persona tendría mayor intención de compra.

Qué situaciones podrían disparar una compra impulsiva.

Qué objeciones podrían impedir la compra.

Qué promesa puede comunicarse de forma atractiva SIN inventar resultados ni hacer afirmaciones engañosas.

No te limites a repetir las características del producto. Convierte características en beneficios y beneficios en motivos de compra.

FASE 2 — CLIENTE IDEAL
Define hasta 3 perfiles de clientes potenciales.

Para cada perfil identifica:

Edad aproximada

Sexo, si es relevante

Situación/contexto

Problema principal

Problemas secundarios

Dolor funcional

Dolor emocional

Deseo principal

Deseos secundarios

Miedos

Frustraciones

Objeciones

Qué ha probado anteriormente

Qué alternativa utiliza actualmente

Qué quiere evitar

Qué quiere conseguir

Qué situación dispara la compra

Nivel de consciencia:

Inconsciente

Consciente del problema

Consciente de la solución

Consciente del producto

Muy consciente

VOZ DEL CLIENTE
Escribe:

10 frases que este cliente diría sobre su problema.

10 frases que diría sobre lo que desea.

10 frases relacionadas con sus objeciones.

10 frases que podrían hacerle pensar: "Esto es exactamente para mí".

Utiliza lenguaje cotidiano del país objetivo.

FASE 3 — MAPA PSICOLÓGICO DE COMPRA
Identifica los principales disparadores psicológicos del producto.

Evalúa del 1 al 10:

Dolor

Deseo

Curiosidad

Conveniencia

Ahorro de tiempo

Ahorro de dinero

Seguridad

Prueba social

Identificación

Transformación

Miedo a seguir igual

Urgencia

Novedad

Estatus

Simplicidad

Después selecciona los 5 disparadores con mayor potencial de conversión y explica brevemente por qué.

FASE 4 — HOOKS
Crea 40 hooks para anuncios de Meta y TikTok.

Distribución:

5 de dolor

5 de deseo

5 de curiosidad

5 de identificación

5 de ruptura de patrón

5 de error común

5 de objeción

5 de transformación

Reglas:

Máximo 15 palabras.

Deben funcionar especialmente bien en los primeros 1-3 segundos.

Lenguaje natural.

Evita clichés.

Evita hooks genéricos.

No uses falsas promesas.

No inventes testimonios.

No hagas afirmaciones médicas o resultados garantizados si no están respaldados.

Prioriza frases que generen:
"Eso me pasa"
"¿Cómo funciona?"
"Yo necesito eso"
"Nunca lo había pensado así".

Para cada hook indica:

Hook | Gatillo psicológico | Nivel de potencial (1-10)

Selecciona posteriormente los 10 mejores hooks.

FASE 5 — ÁNGULOS DE VENTA
A partir de los 10 mejores hooks, crea mínimo 3 ángulos de venta diferentes por hook.

Un ángulo debe representar una razón diferente para comprar, no simplemente cambiar palabras.

Explora cuando sea relevante:

Dolor → alivio

Antes → después

Problema oculto

Error común

Descubrimiento

Curiosidad

Conveniencia

Ahorro de tiempo

Ahorro de dinero

Comparación

Solución alternativa

Transformación

Identificación

Prueba social

Miedo a seguir igual

Deseo aspiracional

Seguridad

Simplicidad

Para cada ángulo entrega:

Hook

Nombre del ángulo

Insight psicológico

Problema que ataca

Deseo que activa

Promesa central

Mecanismo de solución

Objeción que elimina

Beneficio principal

CTA

Después clasifica los 10 mejores ángulos según potencial de conversión.

FASE 6 — CONCEPTOS DE CREATIVOS UGC
Crea 10 conceptos de anuncios UGC.

Cada concepto debe tener:

Ángulo

Hook inicial

Escena de apertura

Problema

Agitación

Presentación del producto

Demostración

Beneficios

Manejo de objeción

CTA

Duración recomendada

Tipo de persona que debería protagonizarlo

Prioriza formatos como:

Problema cotidiano

"Mira lo que encontré"

Antes/después

Demostración

Testimonio estilo UGC

Comparación

POV

Error común

Descubrimiento

Producto en acción

No inventes testimonios reales. Si propones un testimonio, trátalo como guion ficticio para actuación UGC.

FASE 7 — ESTRUCTURA AIDA
Para los 3 mejores ángulos, crea una estructura:

A — ATENCIÓN
Hook + patrón visual.

I — INTERÉS
Presentación del problema y por qué importa.

D — DESEO
Beneficios + transformación + mecanismo.

A — ACCIÓN
Oferta + reducción de riesgo + CTA.

Cada anuncio debe estar pensado para venta directa, no para generar únicamente engagement.

FASE 8 — OBJECIONES COD
Identifica las 10 principales razones por las que alguien podría NO comprar.

Para cada una:

Objeción

Motivo psicológico

Respuesta

Elemento que debería aparecer en el anuncio

Cómo reducir fricción en el proceso COD

Presta especial atención a:

Desconfianza

"¿Será estafa?"

Precio

Calidad

Necesidad real

"Lo voy a pensar"

Gastos de envío

Tiempo de entrega

Miedo a recibir algo diferente

Miedo a que no funcione

FASE 9 — OFERTA
Propón 3 estructuras de oferta.

Para cada una:

Oferta principal

Beneficio percibido

Bono, si tiene sentido

Urgencia, si es legítima

Reducción de riesgo

CTA

No inventes descuentos, bonos, garantías o escasez que no hayan sido proporcionados.

Si falta información, indica qué dato necesito definir.

FASE 10 — PRIORIZACIÓN
Ahora piensa como un media buyer.

Selecciona:

TOP 3 CLIENTES
Los 3 perfiles con mayor potencial.

TOP 5 HOOKS
Los 5 hooks que probarías primero.

TOP 5 ÁNGULOS
Los 5 ángulos que probarías primero.

TOP 3 CREATIVOS
Los 3 conceptos UGC que lanzarías primero.

Para cada selección explica brevemente:

Por qué → Qué hipótesis estamos probando → Qué resultado esperamos.

FORMATO FINAL
Entrega el resultado en este orden:

🔎 Análisis del producto

👤 Clientes ideales

🧠 Mapa psicológico

🎯 40 hooks

💰 Ángulos de venta

🎥 10 conceptos UGC

🅰️ Estructuras AIDA

🛡️ Objeciones COD

🎁 Ofertas

🚀 Plan de test inicial

REGLAS IMPORTANTES
Sé específico.

No entregues teoría innecesaria.

Prioriza insights accionables.

No repitas ideas.

No uses lenguaje corporativo.

Piensa como comprador, no como vendedor.

Piensa en el contexto cultural del país objetivo.

Diferencia claramente característica, beneficio y transformación.

No inventes información sobre el producto.

Si falta un dato crítico, indícalo y continúa con supuestos razonables claramente marcados.

Si el producto tiene restricciones publicitarias o claims sensibles, señálalo.

Prioriza ángulos que puedan convertirse en creativos simples de producir.

El objetivo final es encontrar qué decir, a quién decírselo y desde qué perspectiva venderlo.

Antes de terminar, responde:

"Si tuviera que gastar mi primer dólar en publicidad para este producto, probaría estos 3 conceptos..."

Y enumera los 3 conceptos en orden de prioridad.$prompt$, 'high', 32000, 'Mega prompt validado por el comerciante (2026-10-05), tal cual', true
);
