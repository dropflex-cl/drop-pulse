-- Guardar un guion con keyframe_source=external crea destinos para subir/bindear imágenes,
-- sin encolar renders ni gastar créditos. Los destinos conservan el borrado por producto.
create function public.pi_external_ugc_keyframes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.source='mcp_chat' and new.input->>'keyframe_source'='external' then
  insert into public.video_shots(script_id,product_id,user_id,key,kind,endpoint,input,
    render_status,status,error_code,error_message,finished_at)
  select new.id,new.product_id,new.user_id,k->>'key','keyframe','chat_upload','{}'::jsonb,
    'failed','generated','awaiting_upload','Sube esta imagen desde el chat y asígnala a esta toma.',now()
  from jsonb_array_elements(new.payload->'keyframes') k;
 end if;
 return new;
end $$;
create trigger pi_external_ugc_keyframes after insert on public.video_scripts
for each row execute function public.pi_external_ugc_keyframes();
revoke all on function public.pi_external_ugc_keyframes() from public,anon,authenticated,service_role;
