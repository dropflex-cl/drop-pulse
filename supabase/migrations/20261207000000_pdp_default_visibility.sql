-- Corrige el antiguo default false solo en propuestas que nunca tuvieron una decisión.
-- Una desactivación desde UI cambia updated_at; aprobar/editar también deja decided_at.
-- No se aprueba contenido ni se publica nada en Shopify.
update public.page_components c
set enabled = true, updated_at = clock_timestamp()
where c.enabled = false and c.status = 'generated' and c.decided_at is null
  and c.updated_at = c.created_at and c.superseded_at is null
  and exists(select 1 from public.products p where p.id = c.product_id and p.user_id = c.user_id and p.pi_deleting_at is null);
