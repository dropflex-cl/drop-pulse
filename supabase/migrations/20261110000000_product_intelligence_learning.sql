-- Aprendizajes inmutables, con la medición exacta usada. No declara ganadores.
create table public.pi_product_learnings (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, user_id uuid not null,
 revision bigint not null, strategy_id uuid not null references public.pi_strategy_versions(id) on delete cascade,
 window_from date not null, window_through date not null, content jsonb not null, performance jsonb not null,
 actor_id text not null, created_at timestamptz not null default now(),
 foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
 unique(product_id,revision), check(window_through>=window_from and window_through-window_from<90)
);
alter table public.pi_product_learnings enable row level security;
create policy "owner reads learnings" on public.pi_product_learnings for select using(user_id=(select auth.uid()));
create trigger pi_learning_immutable before update or delete on public.pi_product_learnings for each row execute function public.pi_immutable_context_history();

create function public.pi_performance_data(p_product_id uuid,p_owner_id uuid,p_from date,p_through date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare groups jsonb; etag text;
begin
 if p_from is null or p_through is null or p_through<p_from or p_through-p_from>=90 then raise exception 'PI_VALIDATION_ERROR'; end if;
 select coalesce(jsonb_agg(to_jsonb(g) order by g.currency,g.timezone),'[]'::jsonb) into groups from (
   select c.currency::text,c.timezone,count(distinct c.id) as campaign_count,count(distinct d.date) as days_with_data,
     coalesce(sum(d.spend),0) as spend,coalesce(sum(d.impressions),0) as impressions,coalesce(sum(d.clicks),0) as clicks,
     coalesce(sum(d.purchases),0) as purchases,coalesce(sum(d.purchase_value),0) as purchase_value,
     coalesce(sum(d.initiated_checkouts),0) as initiated_checkouts,max(d.updated_at) as last_synced_at
   from public.ad_campaigns c left join public.ad_insights_daily d on d.campaign_id=c.id and d.user_id=p_owner_id and d.level='campaign'
     and d.date between p_from and p_through
   where c.product_id=p_product_id and c.user_id=p_owner_id group by c.currency,c.timezone
 ) g;
 if jsonb_array_length(groups)>50 then raise exception 'PI_RESPONSE_TOO_LARGE'; end if;
 -- La huella incluye cada fila: dos cambios que se compensan en el agregado siguen siendo cambios.
 select public.pi_snapshot_hash(jsonb_build_array(p_from,p_through,groups,coalesce(jsonb_agg(to_jsonb(d) order by d.unit_id,d.date),'[]'::jsonb))) into etag
   from public.ad_insights_daily d join public.ad_campaigns c on c.id=d.campaign_id and c.user_id=d.user_id
   where c.product_id=p_product_id and c.user_id=p_owner_id and d.level='campaign' and d.date between p_from and p_through;
 return jsonb_build_object('performance_etag',etag,'from',p_from,'through',p_through,'source','meta_cached_daily_campaign','groups',groups,
   'cod',null,'attribution','product_campaigns_only','warnings',jsonb_build_array('Compras reportadas por Meta: no son entregas ni cobros contra entrega.',
     'Datos guardados por la sincronización existente; no se consulta Meta al llamar esta tool. Revisa last_synced_at y días sin datos.',
     'Sin atribución histórica comprobada por ángulo o hook. No infieras causalidad desde la estrategia actual.'));
end $$;
create function public.pi_load_performance(p_access jsonb,p_product_id uuid,p_from date,p_through date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 owner_id:=public.pi_authorize_context(p_access,'performance:read');
 perform public.pi_authorize_context(p_access,'product_intelligence:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'performance:read');
 return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   'request_id',gen_random_uuid(),'data',public.pi_performance_data(p_product_id,owner_id,p_from,p_through));
end $$;
create function public.pi_load_learning(p_access jsonb,p_product_id uuid,p_before_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; items jsonb; last_rev bigint; more boolean;
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:read');
 perform public.pi_authorize_context(p_access,'performance:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'performance:read');
 select coalesce(jsonb_agg(to_jsonb(l)-'user_id'-'actor_id' order by l.revision desc),'[]'::jsonb),min(l.revision) into items,last_rev from
   (select * from public.pi_product_learnings where product_id=p_product_id and user_id=owner_id and (p_before_revision is null or revision<p_before_revision) order by revision desc limit 20) l;
 more:=exists(select 1 from public.pi_product_learnings where product_id=p_product_id and user_id=owner_id and revision<last_rev);
 return jsonb_build_object('ok',true,'product_id',p_product_id,'revision',coalesce((select revision from public.product_intelligence where product_id=p_product_id),0),
   'request_id',gen_random_uuid(),'data',jsonb_build_object('items',items,'has_more',more,'next_before_revision',case when more then last_rev else null end));
end $$;
create function public.pi_commit_learning(p_access jsonb,p_product_id uuid,p_from date,p_through date,p_expected_revision bigint,p_etag text,p_key text,p_hash text,p_learning jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; receipt public.pi_idempotency_records; rev bigint; measured jsonb; snap jsonb; result jsonb; learning_id uuid; request_id uuid:=gen_random_uuid();
begin
 owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'performance:read');
 perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
 if not found then raise exception 'PI_NOT_FOUND'; end if;
 perform public.pi_authorize_context(p_access,'product_intelligence:write');
 perform public.pi_authorize_context(p_access,'performance:read');
 if not p_dry_run then
   select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_product_learning' and idempotency_key=p_key and expires_at>clock_timestamp();
   if found then
     if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
     return receipt.result;
   end if;
 end if;
 rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
 if p_expected_revision is distinct from rev then raise exception 'PI_REVISION_CONFLICT'; end if;
 measured:=public.pi_performance_data(p_product_id,owner_id,p_from,p_through);
 if p_etag is distinct from measured->>'performance_etag' then raise exception 'PI_ARTIFACT_CONFLICT'; end if;
 if p_key is null or p_key !~ '^[A-Za-z0-9._:-]{8,128}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_learning) is distinct from 'object' or octet_length(p_learning::text)>16384
   or p_learning->>'outcome' is null or p_learning->>'outcome' not in ('inconclusive','supports_hypothesis','contradicts_hypothesis') then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not exists(select 1 from public.pi_strategy_versions where id=(p_learning->>'strategy_id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_INVALID_REFERENCE'; end if;
 if p_learning->>'outcome'<>'inconclusive' and not exists(select 1 from jsonb_array_elements(measured->'groups') g where (g->>'days_with_data')::int>0) then raise exception 'PI_VALIDATION_ERROR'; end if;
 if not p_dry_run then
   perform set_config('pi.explicit_context_commit','true',true);
   insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
   insert into public.pi_product_learnings(product_id,user_id,revision,strategy_id,window_from,window_through,content,performance,actor_id)
     values(p_product_id,owner_id,rev+1,(p_learning->>'strategy_id')::uuid,p_from,p_through,p_learning,measured,p_access->>'actor_id') returning id into learning_id;
   snap:=public.pi_context_snapshot(p_product_id);
   update public.product_intelligence set revision=rev+1,updated_at=now() where product_id=p_product_id;
   insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id) values(p_product_id,owner_id,rev+1,snap,public.pi_snapshot_hash(snap),p_access->>'actor_id');
   insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff) values(p_product_id,owner_id,request_id,'save_product_learning',p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,rev+1,jsonb_build_object('learning_id',learning_id));
   rev:=rev+1;
 end if;
 result:=jsonb_build_object('ok',true,'product_id',p_product_id,'revision',rev,'request_id',request_id,'data',jsonb_build_object('applied',not p_dry_run,'dry_run',p_dry_run,'learning_id',learning_id,'next_action','Revisa este aprendizaje y ajusta el análisis en el chat. Selecciona la siguiente estrategia con set_product_strategy; no se modifica automáticamente.'));
 if not p_dry_run then
   delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool='save_product_learning' and idempotency_key=p_key and expires_at<=now();
   insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id) values(p_product_id,owner_id,'save_product_learning',p_key,p_hash,array['product_intelligence:write','performance:read'],result,rev,request_id);
 end if;
 return result;
end $$;
revoke all on function public.pi_performance_data(uuid,uuid,date,date) from public,anon,authenticated,service_role;
revoke all on function public.pi_load_performance(jsonb,uuid,date,date),public.pi_load_learning(jsonb,uuid,bigint),public.pi_commit_learning(jsonb,uuid,date,date,bigint,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.pi_load_performance(jsonb,uuid,date,date),public.pi_load_learning(jsonb,uuid,bigint),public.pi_commit_learning(jsonb,uuid,date,date,bigint,text,text,text,jsonb,boolean) to service_role;
