-- Gemini como segundo proveedor de imágenes (lib/image-provider.ts, lib/integrations/gemini/). El
-- comerciante elige en cada pantalla que genera (Creativos, Imágenes de la página) y la elección queda
-- guardada por etapa. Cada pieza guarda con qué proveedor se generó: el render, el reintento del QA y
-- el sondeo siguen con ese, aunque la elección cambie después.

create table public.image_provider_choices (
  user_id    uuid not null references auth.users on delete cascade,
  stage      text not null check (stage in ('creatives', 'page_images')),
  provider   text not null check (provider in ('higgsfield', 'gemini')),
  updated_at timestamptz not null default now(),
  primary key (user_id, stage)
);
alter table public.image_provider_choices enable row level security;
create policy "dueño lee" on public.image_provider_choices for select using (user_id = (select auth.uid()));

alter table public.creative_assets add column provider text not null default 'higgsfield' check (provider in ('higgsfield', 'gemini'));

-- Solo las generadas tienen proveedor; las subidas y las fotos de Información base, null.
alter table public.page_images add column provider text check (provider in ('higgsfield', 'gemini'));
update public.page_images set provider = 'higgsfield' where source = 'ai';
