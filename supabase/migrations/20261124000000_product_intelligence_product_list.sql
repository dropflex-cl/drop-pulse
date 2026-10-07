-- Descubrimiento de productos sin conocer su ID. Solo lectura, sin crear contexto PI.
create function public.pi_list_products(p_access jsonb, p_page_size integer default 20,
  p_cursor uuid default null, p_include_upsell boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; result jsonb;
begin
  owner_id := public.pi_authorize_context(p_access, 'product_intelligence:read');
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 or p_include_upsell is null then
    raise exception 'PI_VALIDATION_ERROR';
  end if;
  with candidates as (
    select p.id, left(coalesce(nullif(btrim(i.display_name), ''), nullif(btrim(p.title), ''), 'Producto'), 512) as name,
      nullif(btrim(regexp_replace(coalesce(nullif(btrim(i.description), ''), p.description, ''), '\s+', ' ', 'g')), '') as description
    from public.products p
    left join public.pi_product_inputs i on i.product_id = p.id and i.user_id = owner_id
    where p.user_id = owner_id and p.pi_deleting_at is null
      and (p_include_upsell or not p.is_upsell) and (p_cursor is null or p.id > p_cursor)
    order by p.id limit p_page_size + 1
  ), page as (
    select * from candidates order by id limit p_page_size
  )
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object('product_id', id, 'name', name,
      'description', case when length(description) > 300 then left(description, 299) || '…' else description end) order by id) from page), '[]'::jsonb),
    'next_cursor', case when (select count(*) from candidates) > p_page_size
      then (select id from page order by id desc limit 1) else null end
  ) into result;
  return result;
end $$;

revoke all on function public.pi_list_products(jsonb,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.pi_list_products(jsonb,integer,uuid,boolean) to service_role;
