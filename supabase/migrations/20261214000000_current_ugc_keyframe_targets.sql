-- Integra guiones vigentes editables con los destinos externos introducidos en 20261212.
-- No genera archivos, elimina tomas ni cambia decisiones o trabajos ya existentes.
begin;
create or replace function public.pi_external_ugc_keyframes() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.source='mcp_chat' and new.input->>'keyframe_source'='external' then
  insert into public.video_shots(script_id,product_id,user_id,key,kind,endpoint,input,
    render_status,status,error_code,error_message,finished_at)
  select new.id,new.product_id,new.user_id,k->>'key','keyframe','chat_upload','{}'::jsonb,
    'failed','generated','awaiting_upload','Sube esta imagen desde el chat y asígnala a esta toma.',now()
  from jsonb_array_elements(new.payload->'keyframes') k
  where not exists(select 1 from public.video_shots s where s.script_id=new.id and s.key=k->>'key'
    and s.kind='keyframe' and s.superseded_at is null);
 end if;
 return new;
end $$;
drop trigger if exists pi_external_ugc_keyframes on public.video_scripts;
create trigger pi_external_ugc_keyframes after insert or update of input,payload on public.video_scripts
for each row execute function public.pi_external_ugc_keyframes();
revoke all on function public.pi_external_ugc_keyframes() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
