-- Imagen base de cada producto: la que el comerciante elige en Información base (tocar una imagen de
-- referencia). Toda generación posterior (ficha, cliente ideal, creativos, anuncios) parte de ella.
-- Sin elección explícita, la app usa la portada de Shopify y, si no, la primera en uso
-- (baseImage en lib/products/store.ts).
alter table public.product_reference_images
  add column is_base boolean not null default false;

-- Una sola imagen base por producto.
create unique index product_reference_images_one_base
  on public.product_reference_images (product_id) where is_base;

-- Cambiar la base en una sola transacción (quitar la anterior y marcar la nueva). Elegirla también
-- la vuelve a usar como referencia. Solo service_role (escrituras desde el servidor).
create function public.set_base_reference_image(p_user_id uuid, p_product_id uuid, p_image_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.product_reference_images
    where id = p_image_id and product_id = p_product_id and user_id = p_user_id
  ) then
    return false;
  end if;
  update public.product_reference_images
     set is_base = false
   where product_id = p_product_id and user_id = p_user_id and is_base and id <> p_image_id;
  update public.product_reference_images
     set is_base = true, excluded = false
   where id = p_image_id;
  return true;
end;
$$;

revoke execute on function public.set_base_reference_image(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_base_reference_image(uuid, uuid, uuid) to service_role;
