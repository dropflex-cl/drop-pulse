-- Un aprendizaje recuperado puede citarse en research y en la siguiente estrategia.
create or replace function public.pi_internal_references(p_product_id uuid,p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(ref order by ref),'[]'::jsonb) from (
   select 'product_reference_image:'||id as ref from public.product_reference_images where product_id=p_product_id and user_id=p_user_id
   union all select 'product_review:'||id from public.product_reviews where product_id=p_product_id and user_id=p_user_id
   union all select 'product_learning:'||id from public.pi_product_learnings where product_id=p_product_id and user_id=p_user_id
 ) t;
$$;
