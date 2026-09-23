# Esquema de Supabase propuesto

Propuesta para reemplazar los mocks de `lib/mock/`. **No está aplicada**: no se creó ninguna tabla. La UI no cambia: solo el cuerpo de las funciones de `lib/data/*.ts`.

## Principios

- Cada fila pertenece a un comerciante (`user_id = auth.uid()`), con RLS en todas las tablas.
- El ciclo de vida del contenido es un enum único (`content_status`), el mismo que muestra `StatusBadge`.
- Lo que propone la IA entra como `generado` y solo cambia de estado por una acción del comerciante (`decided_at`, `decided_by`).
- El dinero se guarda en pesos enteros (`integer`, CLP sin decimales); los porcentajes, en `numeric(5,2)`.
- Descartar no borra: `rechazado` conserva la fila para “Recuperar”.

## Enums

```sql
create type content_status as enum ('generado', 'revision', 'aprobado', 'rechazado', 'publicando', 'publicado', 'error');
create type stage_key      as enum ('importado', 'textos', 'imagenes', 'precio', 'publicar', 'anuncios');
create type stage_state    as enum ('done', 'current', 'review', 'available', 'locked', 'error');
create type verdict        as enum ('subir', 'seguir', 'vigilar', 'apagar', 'aprendiendo');
create type image_status   as enum ('idle', 'selected', 'discarded', 'generating', 'error');
```

## Tablas

```sql
-- Supuestos del comerciante (Ajustes)
create table merchant_settings (
  user_id        uuid primary key references auth.users on delete cascade,
  delivery_rate  numeric(5,2) not null default 80,      -- % de pedidos entregados y pagados
  max_cpa        integer      not null default 6000,    -- CLP
  store_domain   text,
  meta_account   text,
  updated_at     timestamptz  not null default now()
);

create table products (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  slug            text not null,
  name            text not null,
  sku             text,
  image_path      text,                                 -- Storage: product-images/<user_id>/<product_id>/…
  supplier_cost   integer not null,
  status          content_status not null default 'generado',
  next_stage      stage_key not null default 'textos',
  stopped_reason  text,                                 -- "Detenido: falta el precio"
  stopped_since   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, slug)
);

-- La ruta del producto (StageList / StageMeter)
create table product_stages (
  product_id  uuid not null references products on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  key         stage_key not null,
  position    smallint not null,
  state       stage_state not null default 'locked',
  description text,                                     -- de qué depende, o el motivo del error
  optional    boolean not null default false,
  primary key (product_id, key)
);

-- Propuestas de texto (ReviewCard). IMPLEMENTADO en inglés y con historial de escrituras:
-- supabase/migrations/20261001000000_page_copy.sql (copy_runs + content_items). Esto queda como la
-- propuesta original.
create table content_items (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  field       text not null,                            -- "Título del producto"
  position    smallint not null,
  original    text,
  proposal    text not null,
  edited_text text,                                     -- "Guardar y aceptar"
  note        text,                                     -- por qué lo propone la IA
  status      content_status not null default 'generado',
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Opciones de imagen (ImageTile)
create table image_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  storage_path text,
  alt         text not null,
  status      image_status not null default 'generating',
  sort_order  smallint,                                  -- 1 = portada; null si no está elegida
  created_at  timestamptz not null default now(),
  unique (product_id, sort_order)
);

-- Precio y oferta (PriceBreakdown + OfferPreview)
create table pricing (
  product_id      uuid primary key references products on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  price           integer not null,
  compare_at      integer check (compare_at is null or compare_at > price),
  shipping_cost   integer not null default 3500,
  ad_cost_per_sale integer not null default 6000,
  status          content_status not null default 'generado',
  updated_at      timestamptz not null default now()
);

create table campaigns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  product_id      uuid references products on delete set null,
  meta_campaign_id text,
  name            text not null,
  paused          boolean not null default false,
  daily_budget    integer not null,
  verdict         verdict not null default 'aprendiendo',
  verdict_reason  text not null,                         -- cita la cifra y el límite
  next_budget     integer,
  started_at      timestamptz not null default now()
);

-- Cifras diarias (historial y métricas de CampaignCard)
create table campaign_daily (
  campaign_id     uuid not null references campaigns on delete cascade,
  user_id         uuid not null references auth.users on delete cascade,
  day             date not null,
  spend           integer not null default 0,
  confirmed_sales integer not null default 0,
  orders          integer not null default 0,
  revenue         integer not null default 0,
  primary key (campaign_id, day)
);

-- Cola de Hoy (AttentionItem); la llena un job o triggers a partir de lo anterior
create table attention_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('error', 'ads', 'ads-up', 'review', 'stuck')),
  priority    smallint not null,                          -- 0 = cuesta dinero o bloquea ventas
  title       text not null,
  subject     text not null,
  detail      text,
  href        text not null,
  product_id  uuid references products on delete cascade,
  campaign_id uuid references campaigns on delete cascade,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
```

Índices mínimos: `(user_id, status)` en `products`, `(product_id, position)` en `content_items`, `(user_id, resolved_at, priority)` en `attention_items`, `(campaign_id, day desc)` en `campaign_daily`.

## RLS

La misma política en cada tabla con `user_id`:

```sql
alter table products enable row level security;
create policy "dueño lee"      on products for select using (user_id = (select auth.uid()));
create policy "dueño crea"     on products for insert with check (user_id = (select auth.uid()));
create policy "dueño edita"    on products for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dueño elimina"  on products for delete using (user_id = (select auth.uid()));
-- Repetir para merchant_settings, product_stages, content_items, image_options, pricing,
-- campaigns, campaign_daily y attention_items.
```

- `merchant_settings` usa `user_id` como clave primaria (una fila por comerciante).
- Las escrituras de la IA (propuestas, imágenes, veredictos) y de la sincronización con Meta/Shopify corren con la `service_role` desde funciones del servidor: nunca desde el cliente.
- Storage: bucket privado `product-images` con política `(storage.foldername(name))[1] = auth.uid()::text`.

## De mocks a consultas

| Función (`lib/data`) | Consulta |
|---|---|
| `getTodayQueue()` | `attention_items` sin `resolved_at`, orden `priority, created_at` |
| `getTodaySummary()` | conteos de `attention_items` abiertos, `products` con `status = 'error'` y `status = 'publicado'` |
| `getProducts(filter)` | `products` + `product_stages` (para el medidor); el filtro se deriva: `publicado` → Publicados, `stopped_reason` o `error` → Detenidos, el resto → Avanzan |
| `getProduct(id)` | `products` por `slug` + `product_stages` ordenadas |
| `getProductContent(id)` | `content_items` por producto, orden `position` |
| `getProductImages(id)` | `image_options` por producto |
| `getPricing(id)` | `pricing` (+ `merchant_settings` para la nota de supuestos) |
| `getCampaigns()` / `getCampaign(id)` | `campaigns` + agregados de `campaign_daily` de los últimos 7 días |
| `getAssumptions()` | `merchant_settings` |

Las acciones de la UI (aceptar, descartar, deshacer, elegir y ordenar imágenes, aprobar precio, subir o apagar campañas) pasan a ser Server Actions que actualizan `status`, `decided_at` y `sort_order`; “Deshacer” vuelve al estado anterior dentro de los 5 s del toast.

Con Supabase, las lecturas dependen de las cookies de sesión: con `cacheComponents` activo, las páginas que hoy son estáticas tendrán que leer los datos dentro de `<Suspense>` (como ya lo hacen Productos y Campañas con `searchParams`).
