-- Edición local en CapCut: retira el worker Remotion sin borrar historia ni videos finales.
update public.video_montages
set status='cancelled', lease_token=null, heartbeat_at=null, revision=revision+1,
    error_message='El montaje ahora se realiza localmente en CapCut. Descarga el paquete JSON.', updated_at=now()
where status in ('queued','analyzing','ready','render_queued','rendering');
delete from public.video_montage_workers;

-- Impide nuevos trabajos y commits tardíos de un binario anterior.
revoke execute on function public.video_montage_action(uuid,uuid,uuid,text,text,uuid,bigint,jsonb,text,uuid),
 public.video_montage_work(uuid,text,uuid,jsonb), public.video_montage_expire()
from public,anon,authenticated,service_role;
revoke insert,update,delete on public.video_montage_workers from service_role;

comment on table public.video_montages is 'Historial del render Remotion retirado. No se usa para la edición local en CapCut.';
