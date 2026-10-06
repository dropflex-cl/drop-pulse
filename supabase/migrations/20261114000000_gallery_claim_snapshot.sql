-- Conserva la política QA congelada y cierra toda la cola no enviada al revocar.
create or replace function public.pi_claim_gallery_image(p_image_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare image public.page_images; op public.pi_gallery_operations;
begin
 select * into image from public.page_images where id=p_image_id;
 if image.pi_operation_id is null then return null; end if;
 select * into op from public.pi_gallery_operations where id=image.pi_operation_id;
 perform 1 from public.products where id=op.product_id and user_id=op.user_id and pi_deleting_at is null for update;
 if not found then return null; end if;
 select * into image from public.page_images where id=p_image_id for update;
 if image.render_status<>'queued' or image.error_code='dispatching' or op.status in ('cancelled','failed','reconciling') then return null; end if;
 begin
   perform public.pi_authorize_context(op.access,'landing:generate');
   if op.context_stamp is distinct from public.pi_ugc_context_stamp(op.product_id) then raise exception 'PI_REVISION_CONFLICT'; end if;
 exception when others then
   update public.page_images set render_status='failed',error_code='context_or_authorization_changed',error_message='Cambió el contexto o la autorización. Revisa el plan en el chat.',updated_at=now() where pi_operation_id=op.id and render_status='queued' and (error_code is distinct from 'dispatching' or id=p_image_id);
   update public.pi_gallery_operations set status='cancelled',updated_at=now() where id=op.id;
   return null;
 end;
 update public.page_images set error_code='dispatching',updated_at=now() where id=p_image_id returning * into image;
 update public.pi_gallery_operations set status='running',updated_at=now() where id=op.id;
 return to_jsonb(image)||jsonb_build_object('pi_base_reference_id',op.base_reference_id,'pi_qa_enabled',op.qa_enabled);
end $$;
