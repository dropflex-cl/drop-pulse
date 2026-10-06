-- Conocimiento relacional y estrategias inmutables. Sin backfill ni llamadas a proveedores.

alter table public.product_intelligence add column methodological_notes text check(length(methodological_notes) <= 8192);

alter table public.product_intelligence add column active_strategy_id uuid;

alter table public.pi_idempotency_records drop constraint pi_idempotency_records_tool_check;

alter table public.pi_idempotency_records add constraint pi_idempotency_records_tool_check check(tool in ('save_product_context','save_research','save_product_analysis','patch_product_analysis','set_product_strategy'));

create table public.pi_personas (
  "name" text not null check(length("name") >= 1 and length("name") <= 160),
  "situation" text not null check(length("situation") >= 1 and length("situation") <= 8192),
  "trigger" text not null check(length("trigger") >= 1 and length("trigger") <= 8192),
  "context" text not null check(length("context") >= 1 and length("context") <= 8192),
  "purchase_criteria" jsonb not null check(jsonb_typeof("purchase_criteria") = 'array' and jsonb_array_length("purchase_criteria") between 1 and 100),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "epistemic_status" text not null check("epistemic_status" in ('hypothesis','observed','validated')),
  "validation_note" text check(length("validation_note") >= 1 and length("validation_note") <= 8192),
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);

create table public.pi_jtbd (
  "persona_id" uuid not null,
  "circumstance" text not null check(length("circumstance") >= 1 and length("circumstance") <= 8192),
  "desired_progress" text not null check(length("desired_progress") >= 1 and length("desired_progress") <= 8192),
  "outcome" text not null check(length("outcome") >= 1 and length("outcome") <= 8192),
  "dimension" text not null check("dimension" in ('functional','emotional','social')),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "epistemic_status" text not null check("epistemic_status" in ('hypothesis','observed','validated')),
  "validation_note" text check(length("validation_note") >= 1 and length("validation_note") <= 8192),
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
  unique(id,persona_id,product_id,user_id)
);

create table public.pi_pains (
  "persona_id" uuid not null,
  "description" text not null check(length("description") >= 1 and length("description") <= 8192),
  "frequency" jsonb,
  "severity" jsonb,
  "basis" text not null check(length("basis") >= 1 and length("basis") <= 8192),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "epistemic_status" text not null check("epistemic_status" in ('hypothesis','observed','validated')),
  "validation_note" text check(length("validation_note") >= 1 and length("validation_note") <= 8192),
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
  unique(id,persona_id,product_id,user_id)
);

create table public.pi_desires (
  "persona_id" uuid not null,
  "desired_outcome" text not null check(length("desired_outcome") >= 1 and length("desired_outcome") <= 8192),
  "dimension" text not null check("dimension" in ('functional','emotional','social')),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "epistemic_status" text not null check("epistemic_status" in ('hypothesis','observed','validated')),
  "validation_note" text check(length("validation_note") >= 1 and length("validation_note") <= 8192),
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
  unique(id,persona_id,product_id,user_id)
);

create table public.pi_objections (
  "persona_id" uuid not null,
  "objection" text not null check(length("objection") >= 1 and length("objection") <= 8192),
  "proposed_response" text check(length("proposed_response") >= 1 and length("proposed_response") <= 8192),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "epistemic_status" text not null check("epistemic_status" in ('hypothesis','observed','validated')),
  "validation_note" text check(length("validation_note") >= 1 and length("validation_note") <= 8192),
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
  unique(id,persona_id,product_id,user_id)
);

create table public.pi_angles (
  "persona_id" uuid not null,
  "name" text not null check(length("name") >= 1 and length("name") <= 160),
  "promise" text not null check(length("promise") >= 1 and length("promise") <= 8192),
  "mechanism" text check(length("mechanism") >= 1 and length("mechanism") <= 8192),
  "hook" text not null check(length("hook") >= 1 and length("hook") <= 8192),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "frame" text check("frame" in ('authority','common_enemy','unique_mechanism','age_identity','personal_story','offer')),
  "tone" text check(length("tone") >= 1 and length("tone") <= 8192),
  "speaks_to" text not null check("speaks_to" in ('buyer','user','both')),
  "trigger" text check(length("trigger") >= 1 and length("trigger") <= 8192),
  "generation_guidance" jsonb,
  "epistemic_status" text not null check("epistemic_status" in ('hypothesis','observed','validated')),
  "validation_note" text check(length("validation_note") >= 1 and length("validation_note") <= 8192),
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
  unique(id,persona_id,product_id,user_id)
);

create table public.pi_customer_language (
  "text" text not null check(length("text") >= 1 and length("text") <= 8192),
  "type" text not null check("type" in ('hook','ugc_script','question','reply','customer_quote')),
  "origin" text not null check("origin" in ('synthetic','observed')),
  "persona_id" uuid not null,
  "angle_id" uuid,
  "source_id" uuid,
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade,
  unique(id,persona_id,product_id,user_id)
);

create table public.pi_offers (
  "name" text not null check(length("name") >= 1 and length("name") <= 160),
  "headline" text not null check(length("headline") >= 1 and length("headline") <= 8192),
  "items" jsonb not null check(jsonb_typeof("items") = 'array' and jsonb_array_length("items") between 1 and 3),
  "priority" bigint not null check("priority" >= 1 and "priority" <= 1000000),
  "financial_snapshot" jsonb,
  "pricing_stamp" text check("pricing_stamp" ~ '^[0-9a-f]{64}$'),
  "policies_stamp" text check("policies_stamp" ~ '^[0-9a-f]{64}$'),
  "stale" boolean not null,
  "id" uuid not null,
  "lifecycle" text not null check("lifecycle" in ('active','archived')),
  "archived_reason" text check(length("archived_reason") >= 1 and length("archived_reason") <= 8192),
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);

create table public.pi_sources (
  "title" text not null check(length("title") >= 1 and length("title") <= 256),
  "source_type" text not null check("source_type" in ('manufacturer','supplier','retailer','study','customer','internal','other')),
  "retrieved_at" timestamptz not null,
  "excerpt" text not null check(length("excerpt") >= 1 and length("excerpt") <= 8192),
  "author" text check(length("author") >= 1 and length("author") <= 256),
  "editor" text check(length("editor") >= 1 and length("editor") <= 256),
  "url" text check(length("url") <= 2048 and "url" ~ '^https:\/\/'),
  "internal_ref" jsonb,
  "id" uuid not null,
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);

create table public.pi_facts (
  "key" text not null check("key" ~ '^[a-z][a-z0-9_]{0,63}$'),
  "statement" text not null check(length("statement") >= 1 and length("statement") <= 8192),
  "value" jsonb not null,
  "unit" text check(length("unit") >= 1 and length("unit") <= 64),
  "verification_status" text not null check("verification_status" in ('unverified','verified','disputed','rejected')),
  "usage_status" text not null check("usage_status" in ('pending','approved','prohibited')),
  "reason" text not null check(length("reason") >= 1 and length("reason") <= 8192),
  "id" uuid not null,
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);

create table public.pi_fact_evidence (
  "fact_id" uuid not null,
  "source_id" uuid not null,
  "relation" text not null check("relation" in ('supports','contradicts','contextualizes')),
  "fragment" text not null check(length("fragment") >= 1 and length("fragment") <= 8192),
  "id" uuid not null,
  "last_revision" bigint not null check("last_revision" >= 1 and "last_revision" <= 9007199254740991),
  product_id uuid not null,
  user_id uuid not null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(id,product_id,user_id),
  unique(id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);

alter table public.pi_jtbd add foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_pains add foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_desires add foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_objections add foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_angles add foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_customer_language add foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_customer_language add foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_customer_language add foreign key(source_id,product_id,user_id) references public.pi_sources(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_customer_language add foreign key(angle_id,persona_id,product_id,user_id) references public.pi_angles(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_fact_evidence add foreign key(source_id,product_id,user_id) references public.pi_sources(id,product_id,user_id) on delete cascade deferrable initially deferred;

alter table public.pi_fact_evidence add foreign key(fact_id,product_id,user_id) references public.pi_facts(id,product_id,user_id) on delete cascade deferrable initially deferred;

create table public.pi_angle_jtbd (angle_id uuid not null,
jtbd_id uuid not null,
product_id uuid not null,
user_id uuid not null,
position integer not null check(position between 1 and 100),
primary key(angle_id,jtbd_id,product_id,user_id),
foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(jtbd_id,product_id,user_id) references public.pi_jtbd(id,product_id,user_id) on delete cascade deferrable initially deferred,
persona_id uuid not null,
foreign key(angle_id,persona_id,product_id,user_id) references public.pi_angles(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(jtbd_id,persona_id,product_id,user_id) references public.pi_jtbd(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred);

create table public.pi_angle_pains (angle_id uuid not null,
pain_id uuid not null,
product_id uuid not null,
user_id uuid not null,
position integer not null check(position between 1 and 100),
primary key(angle_id,pain_id,product_id,user_id),
foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(pain_id,product_id,user_id) references public.pi_pains(id,product_id,user_id) on delete cascade deferrable initially deferred,
persona_id uuid not null,
foreign key(angle_id,persona_id,product_id,user_id) references public.pi_angles(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(pain_id,persona_id,product_id,user_id) references public.pi_pains(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred);

create table public.pi_angle_desires (angle_id uuid not null,
desire_id uuid not null,
product_id uuid not null,
user_id uuid not null,
position integer not null check(position between 1 and 100),
primary key(angle_id,desire_id,product_id,user_id),
foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(desire_id,product_id,user_id) references public.pi_desires(id,product_id,user_id) on delete cascade deferrable initially deferred,
persona_id uuid not null,
foreign key(angle_id,persona_id,product_id,user_id) references public.pi_angles(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(desire_id,persona_id,product_id,user_id) references public.pi_desires(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred);

create table public.pi_angle_facts (angle_id uuid not null,
fact_id uuid not null,
product_id uuid not null,
user_id uuid not null,
position integer not null check(position between 1 and 100),
primary key(angle_id,fact_id,product_id,user_id),
foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(fact_id,product_id,user_id) references public.pi_facts(id,product_id,user_id) on delete cascade deferrable initially deferred);

create table public.pi_objection_facts (objection_id uuid not null,
fact_id uuid not null,
product_id uuid not null,
user_id uuid not null,
position integer not null check(position between 1 and 100),
primary key(objection_id,fact_id,product_id,user_id),
foreign key(objection_id,product_id,user_id) references public.pi_objections(id,product_id,user_id) on delete cascade deferrable initially deferred,
foreign key(fact_id,product_id,user_id) references public.pi_facts(id,product_id,user_id) on delete cascade deferrable initially deferred);

create table public.pi_analysis_evidence (product_id uuid not null,
user_id uuid not null,
source_id uuid not null,
position integer not null check(position between 1 and 100),
relation text not null check(relation in ('supports','contradicts','contextualizes')),
fragment text not null check(length(fragment) between 1 and 8192),
foreign key(source_id,product_id,user_id) references public.pi_sources(id,product_id,user_id) on delete cascade deferrable initially deferred,
persona_id uuid,
foreign key(persona_id,product_id,user_id) references public.pi_personas(id,product_id,user_id) on delete cascade deferrable initially deferred,
jtbd_id uuid,
foreign key(jtbd_id,product_id,user_id) references public.pi_jtbd(id,product_id,user_id) on delete cascade deferrable initially deferred,
pain_id uuid,
foreign key(pain_id,product_id,user_id) references public.pi_pains(id,product_id,user_id) on delete cascade deferrable initially deferred,
desire_id uuid,
foreign key(desire_id,product_id,user_id) references public.pi_desires(id,product_id,user_id) on delete cascade deferrable initially deferred,
objection_id uuid,
foreign key(objection_id,product_id,user_id) references public.pi_objections(id,product_id,user_id) on delete cascade deferrable initially deferred,
angle_id uuid,
foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred,
check(num_nonnulls(persona_id,jtbd_id,pain_id,desire_id,objection_id,angle_id) = 1));

create unique index pi_evidence_persona_position on public.pi_analysis_evidence(persona_id,position) where persona_id is not null;

create unique index pi_evidence_jtbd_position on public.pi_analysis_evidence(jtbd_id,position) where jtbd_id is not null;

create unique index pi_evidence_pain_position on public.pi_analysis_evidence(pain_id,position) where pain_id is not null;

create unique index pi_evidence_desire_position on public.pi_analysis_evidence(desire_id,position) where desire_id is not null;

create unique index pi_evidence_objection_position on public.pi_analysis_evidence(objection_id,position) where objection_id is not null;

create unique index pi_evidence_angle_position on public.pi_analysis_evidence(angle_id,position) where angle_id is not null;

alter table public.pi_pains add column frequency_source_id uuid generated always as ((frequency->>'source_id')::uuid) stored;
alter table public.pi_pains add column severity_source_id uuid generated always as ((severity->>'source_id')::uuid) stored;
alter table public.pi_pains add foreign key(frequency_source_id,product_id,user_id) references public.pi_sources(id,product_id,user_id) on delete cascade deferrable initially deferred;
alter table public.pi_pains add foreign key(severity_source_id,product_id,user_id) references public.pi_sources(id,product_id,user_id) on delete cascade deferrable initially deferred;
create table public.pi_angle_proof_facts (
 angle_id uuid not null, fact_id uuid not null, product_id uuid not null, user_id uuid not null,
 primary key(angle_id,fact_id,product_id,user_id),
 foreign key(angle_id,product_id,user_id) references public.pi_angles(id,product_id,user_id) on delete cascade deferrable initially deferred,
 foreign key(fact_id,product_id,user_id) references public.pi_facts(id,product_id,user_id) on delete cascade deferrable initially deferred
);
create table public.pi_angle_objections (
 angle_id uuid not null, objection_id uuid not null, persona_id uuid not null, product_id uuid not null, user_id uuid not null,
 primary key(angle_id,objection_id,product_id,user_id),
 foreign key(angle_id,persona_id,product_id,user_id) references public.pi_angles(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred,
 foreign key(objection_id,persona_id,product_id,user_id) references public.pi_objections(id,persona_id,product_id,user_id) on delete cascade deferrable initially deferred
);

create function public.pi_knowledge_graph(p_product_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g jsonb := '{}'::jsonb; rows jsonb; begin

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' || jsonb_build_object('evidence',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'relation',e.relation,'fragment',e.fragment) order by position) from public.pi_analysis_evidence e where e.persona_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into rows from public.pi_personas t where product_id=p_product_id; g := g || jsonb_build_object('persona',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' || jsonb_build_object('evidence',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'relation',e.relation,'fragment',e.fragment) order by position) from public.pi_analysis_evidence e where e.jtbd_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into rows from public.pi_jtbd t where product_id=p_product_id; g := g || jsonb_build_object('jtbd',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at'-'frequency_source_id'-'severity_source_id' || jsonb_build_object('evidence',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'relation',e.relation,'fragment',e.fragment) order by position) from public.pi_analysis_evidence e where e.pain_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into rows from public.pi_pains t where product_id=p_product_id; g := g || jsonb_build_object('pain',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' || jsonb_build_object('evidence',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'relation',e.relation,'fragment',e.fragment) order by position) from public.pi_analysis_evidence e where e.desire_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into rows from public.pi_desires t where product_id=p_product_id; g := g || jsonb_build_object('desire',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' || jsonb_build_object('evidence',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'relation',e.relation,'fragment',e.fragment) order by position) from public.pi_analysis_evidence e where e.objection_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb),'fact_ids',coalesce((select jsonb_agg(e.fact_id order by position) from public.pi_objection_facts e where e.objection_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into rows from public.pi_objections t where product_id=p_product_id; g := g || jsonb_build_object('objection',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' || jsonb_build_object('evidence',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'relation',e.relation,'fragment',e.fragment) order by position) from public.pi_analysis_evidence e where e.angle_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb),'jtbd_ids',coalesce((select jsonb_agg(e.jtbd_id order by position) from public.pi_angle_jtbd e where e.angle_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb),'pain_ids',coalesce((select jsonb_agg(e.pain_id order by position) from public.pi_angle_pains e where e.angle_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb),'desire_ids',coalesce((select jsonb_agg(e.desire_id order by position) from public.pi_angle_desires e where e.angle_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb),'fact_ids',coalesce((select jsonb_agg(e.fact_id order by position) from public.pi_angle_facts e where e.angle_id=t.id and e.product_id=t.product_id and e.user_id=t.user_id),'[]'::jsonb)) order by t.id),'[]'::jsonb) into rows from public.pi_angles t where product_id=p_product_id; g := g || jsonb_build_object('angle',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' order by t.id),'[]'::jsonb) into rows from public.pi_customer_language t where product_id=p_product_id; g := g || jsonb_build_object('customer_language',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' order by t.id),'[]'::jsonb) into rows from public.pi_offers t where product_id=p_product_id; g := g || jsonb_build_object('offer',rows);

select coalesce(jsonb_agg((to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at') || jsonb_build_object('retrieved_at',to_char(t.retrieved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by t.id),'[]'::jsonb) into rows from public.pi_sources t where product_id=p_product_id; g := g || jsonb_build_object('Source',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at'-'verification_hash'-'verified_at'-'verified_by' order by t.id),'[]'::jsonb) into rows from public.pi_facts t where product_id=p_product_id; g := g || jsonb_build_object('Fact',rows);

select coalesce(jsonb_agg(to_jsonb(t)-'product_id'-'user_id'-'created_by'-'updated_by'-'created_at'-'updated_at' order by t.id),'[]'::jsonb) into rows from public.pi_fact_evidence t where product_id=p_product_id; g := g || jsonb_build_object('EvidenceLink',rows);

return g; end $$;

create function public.pi_write_knowledge(p_product_id uuid,p_user_id uuid,p_graph jsonb,p_actor text) returns void language plpgsql security definer set search_path = '' as $$
declare r jsonb; v record; begin

for r in select value from jsonb_array_elements(p_graph->'persona') loop
select * into v from jsonb_populate_record(null::public.pi_personas,r);
insert into public.pi_personas("name","situation","trigger","context","purchase_criteria","priority","epistemic_status","validation_note","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."name",v."situation",v."trigger",v."context",v."purchase_criteria",v."priority",v."epistemic_status",v."validation_note",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "name"=excluded."name","situation"=excluded."situation","trigger"=excluded."trigger","context"=excluded."context","purchase_criteria"=excluded."purchase_criteria","priority"=excluded."priority","epistemic_status"=excluded."epistemic_status","validation_note"=excluded."validation_note","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_personas.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'jtbd') loop
select * into v from jsonb_populate_record(null::public.pi_jtbd,r);
insert into public.pi_jtbd("persona_id","circumstance","desired_progress","outcome","dimension","priority","epistemic_status","validation_note","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."persona_id",v."circumstance",v."desired_progress",v."outcome",v."dimension",v."priority",v."epistemic_status",v."validation_note",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "persona_id"=excluded."persona_id","circumstance"=excluded."circumstance","desired_progress"=excluded."desired_progress","outcome"=excluded."outcome","dimension"=excluded."dimension","priority"=excluded."priority","epistemic_status"=excluded."epistemic_status","validation_note"=excluded."validation_note","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_jtbd.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'pain') loop
select * into v from jsonb_populate_record(null::public.pi_pains,r);
insert into public.pi_pains("persona_id","description","frequency","severity","basis","priority","epistemic_status","validation_note","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."persona_id",v."description",v."frequency",v."severity",v."basis",v."priority",v."epistemic_status",v."validation_note",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "persona_id"=excluded."persona_id","description"=excluded."description","frequency"=excluded."frequency","severity"=excluded."severity","basis"=excluded."basis","priority"=excluded."priority","epistemic_status"=excluded."epistemic_status","validation_note"=excluded."validation_note","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_pains.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'desire') loop
select * into v from jsonb_populate_record(null::public.pi_desires,r);
insert into public.pi_desires("persona_id","desired_outcome","dimension","priority","epistemic_status","validation_note","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."persona_id",v."desired_outcome",v."dimension",v."priority",v."epistemic_status",v."validation_note",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "persona_id"=excluded."persona_id","desired_outcome"=excluded."desired_outcome","dimension"=excluded."dimension","priority"=excluded."priority","epistemic_status"=excluded."epistemic_status","validation_note"=excluded."validation_note","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_desires.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'objection') loop
select * into v from jsonb_populate_record(null::public.pi_objections,r);
insert into public.pi_objections("persona_id","objection","proposed_response","priority","epistemic_status","validation_note","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."persona_id",v."objection",v."proposed_response",v."priority",v."epistemic_status",v."validation_note",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "persona_id"=excluded."persona_id","objection"=excluded."objection","proposed_response"=excluded."proposed_response","priority"=excluded."priority","epistemic_status"=excluded."epistemic_status","validation_note"=excluded."validation_note","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_objections.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'angle') loop
select * into v from jsonb_populate_record(null::public.pi_angles,r);
insert into public.pi_angles("persona_id","name","promise","mechanism","hook","priority","frame","tone","speaks_to","trigger","generation_guidance","epistemic_status","validation_note","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."persona_id",v."name",v."promise",v."mechanism",v."hook",v."priority",v."frame",v."tone",v."speaks_to",v."trigger",v."generation_guidance",v."epistemic_status",v."validation_note",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "persona_id"=excluded."persona_id","name"=excluded."name","promise"=excluded."promise","mechanism"=excluded."mechanism","hook"=excluded."hook","priority"=excluded."priority","frame"=excluded."frame","tone"=excluded."tone","speaks_to"=excluded."speaks_to","trigger"=excluded."trigger","generation_guidance"=excluded."generation_guidance","epistemic_status"=excluded."epistemic_status","validation_note"=excluded."validation_note","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_angles.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'customer_language') loop
select * into v from jsonb_populate_record(null::public.pi_customer_language,r);
insert into public.pi_customer_language("text","type","origin","persona_id","angle_id","source_id","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."text",v."type",v."origin",v."persona_id",v."angle_id",v."source_id",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "text"=excluded."text","type"=excluded."type","origin"=excluded."origin","persona_id"=excluded."persona_id","angle_id"=excluded."angle_id","source_id"=excluded."source_id","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_customer_language.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'offer') loop
select * into v from jsonb_populate_record(null::public.pi_offers,r);
insert into public.pi_offers("name","headline","items","priority","financial_snapshot","pricing_stamp","policies_stamp","stale","id","lifecycle","archived_reason","last_revision",product_id,user_id,created_by,updated_by) values(v."name",v."headline",v."items",v."priority",v."financial_snapshot",v."pricing_stamp",v."policies_stamp",v."stale",v."id",v."lifecycle",v."archived_reason",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "name"=excluded."name","headline"=excluded."headline","items"=excluded."items","priority"=excluded."priority","financial_snapshot"=excluded."financial_snapshot","pricing_stamp"=excluded."pricing_stamp","policies_stamp"=excluded."policies_stamp","stale"=excluded."stale","lifecycle"=excluded."lifecycle","archived_reason"=excluded."archived_reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_offers.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'Source') loop
select * into v from jsonb_populate_record(null::public.pi_sources,r);
insert into public.pi_sources("title","source_type","retrieved_at","excerpt","author","editor","url","internal_ref","id","last_revision",product_id,user_id,created_by,updated_by) values(v."title",v."source_type",v."retrieved_at",v."excerpt",v."author",v."editor",v."url",v."internal_ref",v."id",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "title"=excluded."title","source_type"=excluded."source_type","retrieved_at"=excluded."retrieved_at","excerpt"=excluded."excerpt","author"=excluded."author","editor"=excluded."editor","url"=excluded."url","internal_ref"=excluded."internal_ref","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_sources.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'Fact') loop
select * into v from jsonb_populate_record(null::public.pi_facts,r);
insert into public.pi_facts("key","statement","value","unit","verification_status","usage_status","reason","id","last_revision",product_id,user_id,created_by,updated_by) values(v."key",v."statement",v."value",v."unit",v."verification_status",v."usage_status",v."reason",v."id",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "key"=excluded."key","statement"=excluded."statement","value"=excluded."value","unit"=excluded."unit","verification_status"=excluded."verification_status","usage_status"=excluded."usage_status","reason"=excluded."reason","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_facts.last_revision is distinct from excluded.last_revision;
end loop;

for r in select value from jsonb_array_elements(p_graph->'EvidenceLink') loop
select * into v from jsonb_populate_record(null::public.pi_fact_evidence,r);
insert into public.pi_fact_evidence("fact_id","source_id","relation","fragment","id","last_revision",product_id,user_id,created_by,updated_by) values(v."fact_id",v."source_id",v."relation",v."fragment",v."id",v."last_revision",p_product_id,p_user_id,p_actor,p_actor) on conflict(id,product_id,user_id) do update set "fact_id"=excluded."fact_id","source_id"=excluded."source_id","relation"=excluded."relation","fragment"=excluded."fragment","last_revision"=excluded."last_revision",updated_by=p_actor,updated_at=now() where pi_fact_evidence.last_revision is distinct from excluded.last_revision;
end loop;

delete from public.pi_angle_jtbd where product_id=p_product_id;

for r in select value from jsonb_array_elements(p_graph->'angle') loop insert into public.pi_angle_jtbd(angle_id,jtbd_id,product_id,user_id,position,persona_id) select (r->>'id')::uuid,value::uuid,p_product_id,p_user_id,ordinality::integer,(r->>'persona_id')::uuid from jsonb_array_elements_text(r->'jtbd_ids') with ordinality; end loop;

delete from public.pi_angle_pains where product_id=p_product_id;

for r in select value from jsonb_array_elements(p_graph->'angle') loop insert into public.pi_angle_pains(angle_id,pain_id,product_id,user_id,position,persona_id) select (r->>'id')::uuid,value::uuid,p_product_id,p_user_id,ordinality::integer,(r->>'persona_id')::uuid from jsonb_array_elements_text(r->'pain_ids') with ordinality; end loop;

delete from public.pi_angle_desires where product_id=p_product_id;

for r in select value from jsonb_array_elements(p_graph->'angle') loop insert into public.pi_angle_desires(angle_id,desire_id,product_id,user_id,position,persona_id) select (r->>'id')::uuid,value::uuid,p_product_id,p_user_id,ordinality::integer,(r->>'persona_id')::uuid from jsonb_array_elements_text(r->'desire_ids') with ordinality; end loop;

delete from public.pi_angle_facts where product_id=p_product_id;

for r in select value from jsonb_array_elements(p_graph->'angle') loop insert into public.pi_angle_facts(angle_id,fact_id,product_id,user_id,position) select (r->>'id')::uuid,value::uuid,p_product_id,p_user_id,ordinality::integer from jsonb_array_elements_text(r->'fact_ids') with ordinality; end loop;

delete from public.pi_objection_facts where product_id=p_product_id;

for r in select value from jsonb_array_elements(p_graph->'objection') loop insert into public.pi_objection_facts(objection_id,fact_id,product_id,user_id,position) select (r->>'id')::uuid,value::uuid,p_product_id,p_user_id,ordinality::integer from jsonb_array_elements_text(r->'fact_ids') with ordinality; end loop;

delete from public.pi_analysis_evidence where product_id=p_product_id;

for r in select value from jsonb_array_elements(p_graph->'persona') loop insert into public.pi_analysis_evidence(persona_id,product_id,user_id,source_id,relation,fragment,position) select (r->>'id')::uuid,p_product_id,p_user_id,(value->>'source_id')::uuid,value->>'relation',value->>'fragment',ordinality::integer from jsonb_array_elements(r->'evidence') with ordinality; end loop;

for r in select value from jsonb_array_elements(p_graph->'jtbd') loop insert into public.pi_analysis_evidence(jtbd_id,product_id,user_id,source_id,relation,fragment,position) select (r->>'id')::uuid,p_product_id,p_user_id,(value->>'source_id')::uuid,value->>'relation',value->>'fragment',ordinality::integer from jsonb_array_elements(r->'evidence') with ordinality; end loop;

for r in select value from jsonb_array_elements(p_graph->'pain') loop insert into public.pi_analysis_evidence(pain_id,product_id,user_id,source_id,relation,fragment,position) select (r->>'id')::uuid,p_product_id,p_user_id,(value->>'source_id')::uuid,value->>'relation',value->>'fragment',ordinality::integer from jsonb_array_elements(r->'evidence') with ordinality; end loop;

for r in select value from jsonb_array_elements(p_graph->'desire') loop insert into public.pi_analysis_evidence(desire_id,product_id,user_id,source_id,relation,fragment,position) select (r->>'id')::uuid,p_product_id,p_user_id,(value->>'source_id')::uuid,value->>'relation',value->>'fragment',ordinality::integer from jsonb_array_elements(r->'evidence') with ordinality; end loop;

for r in select value from jsonb_array_elements(p_graph->'objection') loop insert into public.pi_analysis_evidence(objection_id,product_id,user_id,source_id,relation,fragment,position) select (r->>'id')::uuid,p_product_id,p_user_id,(value->>'source_id')::uuid,value->>'relation',value->>'fragment',ordinality::integer from jsonb_array_elements(r->'evidence') with ordinality; end loop;

for r in select value from jsonb_array_elements(p_graph->'angle') loop insert into public.pi_analysis_evidence(angle_id,product_id,user_id,source_id,relation,fragment,position) select (r->>'id')::uuid,p_product_id,p_user_id,(value->>'source_id')::uuid,value->>'relation',value->>'fragment',ordinality::integer from jsonb_array_elements(r->'evidence') with ordinality; end loop;

delete from public.pi_angle_proof_facts where product_id=p_product_id;
delete from public.pi_angle_objections where product_id=p_product_id;
for r in select value from jsonb_array_elements(p_graph->'angle') loop
 insert into public.pi_angle_proof_facts(angle_id,fact_id,product_id,user_id)
 select (r->>'id')::uuid,value::uuid,p_product_id,p_user_id from jsonb_array_elements_text(coalesce(r->'generation_guidance'->'proof_fact_ids','[]'::jsonb));
 insert into public.pi_angle_objections(angle_id,objection_id,persona_id,product_id,user_id)
 select (r->>'id')::uuid,value::uuid,(r->>'persona_id')::uuid,p_product_id,p_user_id from jsonb_array_elements_text(coalesce(r->'generation_guidance'->'objection_ids','[]'::jsonb));
end loop;
end $$;

alter table public.pi_sources add check ((url is null) <> (internal_ref is null));
alter table public.pi_sources add check (url is null or url ~ '^https://');
-- UTF-8 fijo, mismo criterio que pi_snapshot_hash.
create function public.pi_evidence_hash(p_fragment text) returns text language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(p_fragment,'UTF8')),'hex'); $$;
create unique index pi_fact_evidence_content_unique on public.pi_fact_evidence(product_id,user_id,fact_id,source_id,relation,public.pi_evidence_hash(fragment));
alter table public.pi_facts add column verification_hash text;
alter table public.pi_facts add column verified_at timestamptz;
alter table public.pi_facts add column verified_by text;
alter table public.pi_facts add check (usage_status <> 'approved' or verification_status = 'verified');
alter table public.pi_customer_language add check ((origin = 'observed' and source_id is not null) or (origin = 'synthetic' and source_id is null and type <> 'customer_quote'));

create table public.pi_strategy_versions (
  id uuid primary key,
  product_id uuid not null,
  user_id uuid not null,
  analysis_revision bigint not null check(analysis_revision between 0 and 9007199254740991),
  snapshot jsonb not null check(jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 262144),
  operational_hash text not null check(operational_hash ~ '^[a-f0-9]{64}$'),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(id,product_id,user_id),
  foreign key(product_id,user_id) references public.product_intelligence(product_id,user_id) on delete cascade
);
create table public.pi_strategy_events (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null,
  product_id uuid not null,
  user_id uuid not null,
  event_type text not null check(event_type in ('draft','selected','superseded','archived')),
  reason text not null check(length(reason) between 1 and 8192),
  revision bigint not null check(revision between 1 and 9007199254740991),
  actor_id text not null,
  created_at timestamptz not null default now(),
  unique(strategy_id,revision),
  foreign key(strategy_id,product_id,user_id) references public.pi_strategy_versions(id,product_id,user_id) on delete cascade
);
alter table public.product_intelligence add foreign key(active_strategy_id,product_id,user_id)
  references public.pi_strategy_versions(id,product_id,user_id) deferrable initially deferred;
create trigger pi_immutable_strategy before update or delete on public.pi_strategy_versions for each row execute function public.pi_immutable_context_history();
create trigger pi_immutable_strategy_event before update or delete on public.pi_strategy_events for each row execute function public.pi_immutable_context_history();

create function public.pi_strategy_record(p_product_id uuid,p_strategy_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('id',v.id,'snapshot',v.snapshot,'analysis_revision',v.analysis_revision,
   'operational_hash',v.operational_hash,'state',e.event_type,
   'selection_revision',(select revision from public.pi_strategy_events where strategy_id=v.id and event_type='selected' order by revision desc limit 1))
 from public.pi_strategy_versions v cross join lateral
   (select event_type from public.pi_strategy_events where strategy_id=v.id order by revision desc limit 1) e
 where v.id=p_strategy_id and v.product_id=p_product_id;
$$;

-- El wrapper mantiene el contrato de los writers operacionales ya conservados.
alter function public.pi_context_snapshot(uuid) rename to pi_operational_snapshot;
create function public.pi_context_snapshot(p_product_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select public.pi_operational_snapshot(p_product_id) || jsonb_build_object('knowledge',jsonb_build_object(
   'graph',public.pi_knowledge_graph(p_product_id),'methodological_notes',h.methodological_notes,
   'active_strategy_id',h.active_strategy_id,'strategy',public.pi_strategy_record(p_product_id,h.active_strategy_id)))
 from (select 1) x left join public.product_intelligence h on h.product_id=p_product_id;
$$;

create function public.pi_internal_references(p_product_id uuid,p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(ref),'[]'::jsonb) from (
   select 'product_reference_image:'||id as ref from public.product_reference_images where product_id=p_product_id and user_id=p_user_id
   union all select 'product_review:'||id from public.product_reviews where product_id=p_product_id and user_id=p_user_id
 ) t;
$$;

-- Validaciones de pertenencia y estado sensible contra el grafo previo, también bajo lock SQL.
create function public.pi_validate_knowledge(p_access jsonb,p_product_id uuid,p_previous jsonb,p_graph jsonb,p_revision bigint,p_reviewed_ids jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare k text; rows jsonb; r jsonb; old_row jsonb; ref jsonb; target jsonb; sensitive boolean := false;
  affected uuid[] := '{}'; reviewed uuid[] := '{}'; f uuid; source_id uuid; owner_id uuid := (p_access->>'user_id')::uuid;
begin
  if jsonb_typeof(p_graph) <> 'object' or p_graph - array['persona','jtbd','pain','desire','objection','angle','customer_language','offer','Source','Fact','EvidenceLink'] <> '{}'::jsonb
    or octet_length(p_graph::text) > 1048576 then raise exception 'PI_VALIDATION_ERROR'; end if;
  if (select count(*) from jsonb_each(p_graph) e cross join lateral jsonb_array_elements(e.value) node(value))
    <> (select count(distinct node.value->>'id') from jsonb_each(p_graph) e cross join lateral jsonb_array_elements(e.value) node(value)) then raise exception 'PI_VALIDATION_ERROR'; end if;
  foreach k in array array['persona','jtbd','pain','desire','objection','angle','customer_language','offer','Source','Fact','EvidenceLink'] loop
    rows := p_graph->k;
    if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'PI_VALIDATION_ERROR'; end if;
    -- Los comandos V1 archivan; no eliminan identidades ni cambian su tipo.
    if exists(select 1 from jsonb_array_elements(p_previous->k) b where not exists(select 1 from jsonb_array_elements(rows) n where n->>'id'=b->>'id')) then raise exception 'PI_INVALID_REFERENCE'; end if;
    for r in select value from jsonb_array_elements(rows) loop
      select value into old_row from jsonb_array_elements(p_previous->k) where value->>'id'=r->>'id';
      if (old_row is null or (old_row-'last_revision') is distinct from (r-'last_revision')) then
        if (r->>'last_revision')::bigint is distinct from p_revision+1 then raise exception 'PI_VALIDATION_ERROR'; end if;
      elsif r->>'last_revision' is distinct from old_row->>'last_revision' then raise exception 'PI_VALIDATION_ERROR'; end if;
      if k in ('jtbd','pain','desire','objection','angle','customer_language') then
        select value into target from jsonb_array_elements(p_graph->'persona') where value->>'id'=r->>'persona_id';
        if target is null or (r->>'lifecycle'='active' and target->>'lifecycle'<>'active') then raise exception 'PI_INVALID_REFERENCE'; end if;
      end if;
      if k in ('persona','jtbd','pain','desire','objection','angle') then
        if r->>'epistemic_status'<>'hypothesis' and jsonb_array_length(r->'evidence')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        if r->>'epistemic_status'='validated' and coalesce(length(trim(r->>'validation_note')),0)=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        for ref in select value from jsonb_array_elements(r->'evidence') loop
          select value into target from jsonb_array_elements(p_graph->'Source') where value->>'id'=ref->>'source_id';
          if target is null then raise exception 'PI_INVALID_REFERENCE'; end if;
          if coalesce(length(ref->>'fragment'),0)=0 or position(ref->>'fragment' in target->>'excerpt')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        end loop;
      end if;
      if k='Source' then
        if (r->'url'='null'::jsonb) = (r->'internal_ref'='null'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
        if r->'internal_ref'<>'null'::jsonb and not (public.pi_internal_references(p_product_id,owner_id) ? ((r->'internal_ref'->>'kind')||':'||(r->'internal_ref'->>'id'))) then raise exception 'PI_INVALID_REFERENCE'; end if;
      elsif k='EvidenceLink' then
        if (select count(*) from jsonb_array_elements(p_graph->'EvidenceLink') n where (n->>'fact_id',n->>'source_id',n->>'relation',n->>'fragment')=(r->>'fact_id',r->>'source_id',r->>'relation',r->>'fragment'))>1 then raise exception 'PI_VALIDATION_ERROR'; end if;
        if not exists(select 1 from jsonb_array_elements(p_graph->'Fact') where value->>'id'=r->>'fact_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        select value into target from jsonb_array_elements(p_graph->'Source') where value->>'id'=r->>'source_id';
        if target is null then raise exception 'PI_INVALID_REFERENCE'; end if;
        if coalesce(length(r->>'fragment'),0)=0 or position(r->>'fragment' in target->>'excerpt')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
      elsif k='Fact' then
        if r->>'verification_status'='verified' and not exists(select 1 from jsonb_array_elements(p_graph->'EvidenceLink') where value->>'fact_id'=r->>'id' and value->>'relation'='supports') then raise exception 'PI_VALIDATION_ERROR'; end if;
        if r->>'usage_status'='approved' and r->>'verification_status'<>'verified' then raise exception 'PI_VALIDATION_ERROR'; end if;
        if old_row is not null and (old_row->>'verification_status'<>'unverified' or old_row->>'usage_status'<>'pending') then reviewed:=array_append(reviewed,(r->>'id')::uuid); end if;
        if (old_row is null or (old_row-'last_revision') is distinct from (r-'last_revision')) and
          (r->>'verification_status'<>'unverified' or r->>'usage_status'<>'pending' or old_row->>'verification_status'<>'unverified' or old_row->>'usage_status'<>'pending') then
          sensitive:=true; affected:=array_append(affected,(r->>'id')::uuid);
        end if;
      elsif k='angle' then
        if jsonb_array_length(r->'jtbd_ids')=0 or jsonb_array_length(r->'pain_ids')=0 then raise exception 'PI_VALIDATION_ERROR'; end if;
        foreach rows in array array[r->'jtbd_ids',r->'pain_ids',r->'desire_ids',r->'fact_ids',coalesce(r->'generation_guidance'->'proof_fact_ids','[]'::jsonb),coalesce(r->'generation_guidance'->'objection_ids','[]'::jsonb)] loop
          if jsonb_array_length(rows) <> (select count(distinct value) from jsonb_array_elements(rows)) then raise exception 'PI_VALIDATION_ERROR'; end if;
        end loop;
        for ref in select jsonb_build_object('kind',v.kind,'id',x.value) from
          (values ('jtbd',r->'jtbd_ids'),('pain',r->'pain_ids'),('desire',r->'desire_ids'),('Fact',r->'fact_ids'),
          ('Fact',coalesce(r->'generation_guidance'->'proof_fact_ids','[]'::jsonb)),('objection',coalesce(r->'generation_guidance'->'objection_ids','[]'::jsonb))) v(kind,ids)
          cross join lateral jsonb_array_elements_text(v.ids) x loop
          select value into target from jsonb_array_elements(p_graph->(ref->>'kind')) where value->>'id'=ref->>'id';
          if target is null or (ref->>'kind'<>'Fact' and (target->>'persona_id' is distinct from r->>'persona_id' or (r->>'lifecycle'='active' and target->>'lifecycle'<>'active'))) then raise exception 'PI_INVALID_REFERENCE'; end if;
        end loop;
      elsif k='objection' then
        if exists(select 1 from jsonb_array_elements_text(r->'fact_ids') x where not exists(select 1 from jsonb_array_elements(p_graph->'Fact') where value->>'id'=x.value)) then raise exception 'PI_INVALID_REFERENCE'; end if;
      elsif k='pain' then
        for ref in select value from jsonb_array_elements(jsonb_build_array(r->'frequency',r->'severity')) where value->>'basis_type'='observed' loop
          if not exists(select 1 from jsonb_array_elements(p_graph->'Source') where value->>'id'=ref->>'source_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        end loop;
      elsif k='customer_language' then
        if r->'angle_id'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(p_graph->'angle') where value->>'id'=r->>'angle_id' and value->>'persona_id'=r->>'persona_id' and (r->>'lifecycle'<>'active' or value->>'lifecycle'='active')) then raise exception 'PI_INVALID_REFERENCE'; end if;
        if r->>'origin'='observed' and not exists(select 1 from jsonb_array_elements(p_graph->'Source') where value->>'id'=r->>'source_id') then raise exception 'PI_INVALID_REFERENCE'; end if;
        if r->>'origin'='synthetic' and (r->>'type'='customer_quote' or r->'source_id'<>'null'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
      end if;
    end loop;
  end loop;
  -- Cambiar fuentes o respaldo de un hecho revisado requiere verify + revisión explícita del hecho.
  for r in select value from jsonb_array_elements(p_graph->'EvidenceLink') loop
    select value into old_row from jsonb_array_elements(p_previous->'EvidenceLink') where value->>'id'=r->>'id';
    if ((old_row is null and r->>'relation'<>'contradicts') or (old_row is not null and (old_row-'last_revision') is distinct from (r-'last_revision')))
      and ((r->>'fact_id')::uuid=any(reviewed) or (old_row->>'fact_id')::uuid=any(reviewed)) then
      sensitive:=true;
      if (r->>'fact_id')::uuid=any(reviewed) then affected:=array_append(affected,(r->>'fact_id')::uuid); end if;
      if (old_row->>'fact_id')::uuid=any(reviewed) then affected:=array_append(affected,(old_row->>'fact_id')::uuid); end if;
    end if;
  end loop;
  for r in select value from jsonb_array_elements(p_graph->'Source') loop
    select value into old_row from jsonb_array_elements(p_previous->'Source') where value->>'id'=r->>'id';
    if old_row is not null and (old_row-'last_revision') is distinct from (r-'last_revision') then
      for ref in select value from jsonb_array_elements(p_previous->'EvidenceLink') where value->>'source_id'=r->>'id' and (value->>'fact_id')::uuid=any(reviewed) loop
        sensitive:=true; affected:=array_append(affected,(ref->>'fact_id')::uuid);
      end loop;
    end if;
  end loop;
  if sensitive then
    perform public.pi_authorize_context(p_access,'product_intelligence:verify');
    foreach f in array affected loop
      if not (p_reviewed_ids ? f::text) or not exists(select 1 from jsonb_array_elements(p_graph->'Fact') where value->>'id'=f::text and length(trim(value->>'reason'))>0) then raise exception 'PI_VALIDATION_ERROR'; end if;
    end loop;
  end if;
  -- Dependencias de la selección no se pueden archivar sin reemplazar la selección primero.
  for r in select value from jsonb_each(public.pi_strategy_record(p_product_id,(select active_strategy_id from public.product_intelligence where product_id=p_product_id))->'snapshot') loop
    if jsonb_typeof(r)='array' then rows:=r;
    elsif jsonb_typeof(r)='object' and r ? 'id' then rows:=jsonb_build_array(r); else continue; end if;
    for ref in select value from jsonb_array_elements(rows) loop
      if exists(select 1 from jsonb_each(p_graph) g cross join lateral jsonb_array_elements(g.value) n where n->>'id'=ref->>'id' and n->>'lifecycle'='archived') then raise exception 'PI_DEPENDENCY_IN_USE'; end if;
    end loop;
  end loop;
  foreach k in array array['persona','jtbd','pain','desire','objection','angle','offer'] loop
    if exists(select 1 from (
      select (value->>'priority')::bigint p,row_number() over(partition by value->>'persona_id' order by (value->>'priority')::bigint) n
      from jsonb_array_elements(p_graph->k) where value->>'lifecycle'='active'
    ) a where p<>n) then raise exception 'PI_VALIDATION_ERROR'; end if;
  end loop;
  return sensitive;
end $$;

create function public.pi_load_knowledge(p_access jsonb,p_product_id uuid,p_revision bigint default null,p_tool text default null,
  p_key text default null,p_hash text default null,p_dry_run boolean default false,p_performance boolean default false,p_strategy_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; rev bigint; snap jsonb; live_snap jsonb; receipt public.pi_idempotency_records; scope text; effective jsonb; expiry timestamptz;
begin
  scope:=case when p_tool is null then 'product_intelligence:read' else 'product_intelligence:write' end;
  owner_id:=public.pi_authorize_context(p_access,scope);
  if p_tool is not null and p_tool not in ('save_research','save_product_analysis','patch_product_analysis','set_product_strategy') then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_performance then perform public.pi_authorize_context(p_access,'performance:read'); end if;
  perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for share;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  perform public.pi_authorize_context(p_access,scope);
  rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
  if p_key is not null and not p_dry_run then
    select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      foreach scope in array receipt.required_scopes loop perform public.pi_authorize_context(p_access,scope); end loop;
      return jsonb_build_object('replay',receipt.result);
    end if;
  end if;
  live_snap:=public.pi_context_snapshot(p_product_id);
  if p_revision is null or p_revision=rev then snap:=live_snap;
  else select snapshot into snap from public.pi_revisions where product_id=p_product_id and revision=p_revision;
    if not found then raise exception 'PI_NOT_FOUND'; end if;
  end if;
  if p_strategy_id is not null and not exists(select 1 from public.pi_strategy_versions where product_id=p_product_id and user_id=owner_id and id=p_strategy_id) then raise exception 'PI_NOT_FOUND'; end if;
  effective:=p_access->'scopes'; expiry:=clock_timestamp()+interval '1 hour';
  if p_access->>'actor_kind'='delegated' then
    select to_jsonb(array(select jsonb_array_elements_text(p_access->'scopes') intersect select unnest(g.scopes))),g.expires_at
      into effective,expiry from public.pi_access_grants g where user_id=owner_id and client_id=(p_access->>'client_id')::uuid;
  end if;
  return jsonb_build_object('revision',coalesce(p_revision,rev),'current_revision',rev,'snapshot',snap,'stamp',public.pi_snapshot_hash(live_snap),
    'current_snapshot',live_snap,'current_knowledge',live_snap->'knowledge','internal_references',public.pi_internal_references(p_product_id,owner_id),
    'effective_scopes',effective,'grant_expires_at',expiry,'requested_strategy',public.pi_strategy_record(p_product_id,p_strategy_id));
end $$;

create function public.pi_commit_knowledge(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_stamp text,p_tool text,
  p_key text,p_hash text,p_graph jsonb,p_notes text,p_reviewed_ids jsonb,p_strategy jsonb,p_archive jsonb,p_result jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; rev bigint; next_rev bigint; before_snap jsonb; after_snap jsonb; previous jsonb;
  changed boolean; sensitive boolean:=false; receipt public.pi_idempotency_records; scopes text[]:=array['product_intelligence:write'];
  old_active uuid; new_id uuid; scope text; r jsonb; k text; dependency jsonb;
begin
  owner_id:=public.pi_authorize_context(p_access,'product_intelligence:write');
  if p_tool not in ('save_research','save_product_analysis','patch_product_analysis','set_product_strategy') then raise exception 'PI_VALIDATION_ERROR'; end if;
  perform 1 from public.products where id=p_product_id and user_id=owner_id and pi_deleting_at is null for update;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  perform public.pi_authorize_context(p_access,'product_intelligence:write');
  if not p_dry_run then
    select * into receipt from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and tool=p_tool and idempotency_key=p_key and expires_at>clock_timestamp();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      foreach scope in array receipt.required_scopes loop perform public.pi_authorize_context(p_access,scope); end loop;
      return receipt.result;
    end if;
  end if;
  rev:=coalesce((select revision from public.product_intelligence where product_id=p_product_id),0);
  before_snap:=public.pi_context_snapshot(p_product_id); previous:=before_snap->'knowledge'->'graph';
  if p_expected_revision is distinct from rev or p_stamp is distinct from public.pi_snapshot_hash(before_snap) then raise exception 'PI_REVISION_CONFLICT'; end if;
  if p_result->>'ok' is distinct from 'true' or p_result->>'product_id' is distinct from p_product_id::text
    or (p_result->'data'->>'dry_run')::boolean is distinct from p_dry_run or octet_length(p_result::text)>60000 then raise exception 'PI_VALIDATION_ERROR'; end if;
  changed:=not (p_result->'data'->>'no_op')::boolean; next_rev:=rev+case when changed and not p_dry_run then 1 else 0 end;
  if (p_result->>'revision')::bigint is distinct from next_rev or (p_result->'data'->>'applied')::boolean is distinct from (changed and not p_dry_run) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_tool<>'set_product_strategy' then
    if p_strategy is not null or p_archive is not null or (p_result->'data'->>'base_revision')::bigint is distinct from rev then raise exception 'PI_VALIDATION_ERROR'; end if;
    sensitive:=public.pi_validate_knowledge(p_access,p_product_id,previous,p_graph,rev,p_reviewed_ids);
    if changed is distinct from (p_graph is distinct from previous or p_notes is distinct from before_snap->'knowledge'->>'methodological_notes') then raise exception 'PI_VALIDATION_ERROR'; end if;
    if sensitive then scopes:=array_append(scopes,'product_intelligence:verify'); end if;
    if p_tool='save_research' then
      foreach k in array array['persona','jtbd','pain','desire','objection','angle','customer_language','offer'] loop
        if p_graph->k is distinct from previous->k then raise exception 'PI_VALIDATION_ERROR'; end if;
      end loop;
      if p_notes is distinct from before_snap->'knowledge'->>'methodological_notes' then raise exception 'PI_VALIDATION_ERROR'; end if;
    else
      foreach k in array array['Source','Fact','EvidenceLink'] loop
        if p_graph->k is distinct from previous->k then raise exception 'PI_VALIDATION_ERROR'; end if;
      end loop;
    end if;
  else
    if p_graph is not null or (p_strategy is not null and p_archive is not null) then raise exception 'PI_VALIDATION_ERROR'; end if;
    if p_strategy is not null then
      if (p_strategy->>'analysis_revision')::bigint is distinct from rev or p_strategy->>'state' not in ('draft','selected') then raise exception 'PI_REVISION_CONFLICT'; end if;
      -- Cada copia congelada corresponde exactamente a una entidad actual de este producto.
      for k,dependency in select key,value from jsonb_each(p_strategy->'snapshot') loop
        if k='persona' then r:=jsonb_build_array(dependency); k:='persona';
        elsif k='jtbd' then r:=jsonb_build_array(dependency); k:='jtbd';
        elsif k='pain' then r:=jsonb_build_array(dependency); k:='pain';
        elsif k='offer' then if dependency='null'::jsonb then continue; end if; r:=jsonb_build_array(dependency); k:='offer';
        elsif k='related_jtbd' then r:=dependency; k:='jtbd';
        elsif k='related_pains' then r:=dependency; k:='pain';
        elsif k='desires' then r:=dependency; k:='desire';
        elsif k='angles' then r:=dependency; k:='angle';
        elsif k='facts' then r:=dependency; k:='Fact';
        elsif k='sources' then r:=dependency; k:='Source';
        elsif k='evidence_links' then r:=dependency; k:='EvidenceLink';
        elsif k='objections' then r:=dependency; k:='objection';
        elsif k='customer_language' then r:=dependency; k:='customer_language'; else continue; end if;
        if exists(select 1 from jsonb_array_elements(r) d where not exists(select 1 from jsonb_array_elements(previous->k) n where n=d and coalesce(n->>'lifecycle','active')='active')) then raise exception 'PI_INVALID_REFERENCE'; end if;
      end loop;
    elsif p_archive is not null then
      if not exists(select 1 from public.pi_strategy_versions where id=(p_archive->>'id')::uuid and product_id=p_product_id and user_id=owner_id) then raise exception 'PI_NOT_FOUND'; end if;
    elsif changed then raise exception 'PI_VALIDATION_ERROR'; end if;
  end if;
  if p_dry_run then return p_result; end if;
  insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict do nothing;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(p_product_id,owner_id,rev,before_snap,public.pi_snapshot_hash(before_snap),p_access->>'actor_id') on conflict do nothing;
  perform set_config('pi.explicit_context_commit','true',true);
  if changed then
    if p_tool<>'set_product_strategy' then
      perform public.pi_write_knowledge(p_product_id,owner_id,p_graph,p_access->>'actor_id');
      -- Huella de la revisión incluye el contenido y todas las fuentes/enlaces relevantes.
      for r in select value from jsonb_array_elements(p_graph->'Fact') where value->>'id' in (select jsonb_array_elements_text(p_reviewed_ids)) loop
        if r->>'verification_status'='unverified' and r->>'usage_status'='pending' then
          update public.pi_facts set verification_hash=null,verified_by=null,verified_at=null where id=(r->>'id')::uuid and product_id=p_product_id and user_id=owner_id; continue;
        end if;
        update public.pi_facts set verification_hash=public.pi_snapshot_hash(jsonb_build_object('fact',r,
          'links',(select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(p_graph->'EvidenceLink') where value->>'fact_id'=r->>'id'),
          'sources',(select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(p_graph->'Source') where value->>'id' in
            (select value->>'source_id' from jsonb_array_elements(p_graph->'EvidenceLink') where value->>'fact_id'=r->>'id')))),
          verified_by=case when r->>'verification_status'<>'unverified' or r->>'usage_status'<>'pending' then p_access->>'actor_id' else null end,
          verified_at=case when r->>'verification_status'<>'unverified' or r->>'usage_status'<>'pending' then now() else null end where id=(r->>'id')::uuid and product_id=p_product_id and user_id=owner_id;
      end loop;
      update public.product_intelligence set methodological_notes=p_notes where product_id=p_product_id;
    else
      select active_strategy_id into old_active from public.product_intelligence where product_id=p_product_id;
      if p_strategy is not null then
        new_id:=(p_strategy->>'id')::uuid;
        insert into public.pi_strategy_versions(id,product_id,user_id,analysis_revision,snapshot,operational_hash,created_by)
          values(new_id,p_product_id,owner_id,rev,p_strategy->'snapshot',p_strategy->>'operational_hash',p_access->>'actor_id');
        insert into public.pi_strategy_events(strategy_id,product_id,user_id,event_type,reason,revision,actor_id)
          values(new_id,p_product_id,owner_id,p_strategy->>'state',p_strategy->'snapshot'->>'rationale',next_rev,p_access->>'actor_id');
        if p_strategy->>'state'='selected' then
          if old_active is not null then
            insert into public.pi_strategy_events(strategy_id,product_id,user_id,event_type,reason,revision,actor_id)
              values(old_active,p_product_id,owner_id,'superseded','Selección reemplazada',next_rev,p_access->>'actor_id');
          end if;
          update public.product_intelligence set active_strategy_id=new_id where product_id=p_product_id;
        end if;
      else
        new_id:=(p_archive->>'id')::uuid;
        insert into public.pi_strategy_events(strategy_id,product_id,user_id,event_type,reason,revision,actor_id)
          values(new_id,p_product_id,owner_id,'archived',p_archive->>'reason',next_rev,p_access->>'actor_id');
        if old_active=new_id then update public.product_intelligence set active_strategy_id=null where product_id=p_product_id; end if;
      end if;
    end if;
    after_snap:=public.pi_context_snapshot(p_product_id);
    update public.product_intelligence set revision=next_rev,updated_at=now() where product_id=p_product_id;
    insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
      values(p_product_id,owner_id,next_rev,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
    insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
      values(p_product_id,owner_id,(p_result->>'request_id')::uuid,p_tool,p_access->>'actor_id',(p_access->>'client_id')::uuid,rev,next_rev,
        coalesce(p_result->'data'->'diff',jsonb_build_array(jsonb_build_object('entity','strategy','action',case when p_archive is null then 'select' else 'archive' end,'id',new_id))));
  end if;
  delete from public.pi_idempotency_records where product_id=p_product_id and user_id=owner_id and
    (expires_at<=now() or (tool=p_tool and idempotency_key=p_key));
  insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
    values(p_product_id,owner_id,p_tool,p_key,p_hash,scopes,p_result,next_rev,(p_result->>'request_id')::uuid);
  return p_result;
end $$;

-- Comparar snapshots anteriores como conocimiento vacío, sin reescribir historia inmutable.
create function public.pi_normalize_knowledge_snapshot(p_snapshot jsonb) returns jsonb
language sql immutable set search_path = '' as $$
 select case when p_snapshot ? 'knowledge' then p_snapshot else p_snapshot || jsonb_build_object('knowledge',jsonb_build_object(
  'graph',jsonb_build_object('persona','[]'::jsonb,'jtbd','[]'::jsonb,'pain','[]'::jsonb,'desire','[]'::jsonb,'objection','[]'::jsonb,'angle','[]'::jsonb,
    'customer_language','[]'::jsonb,'offer','[]'::jsonb,'Source','[]'::jsonb,'Fact','[]'::jsonb,'EvidenceLink','[]'::jsonb),
  'methodological_notes',null,'active_strategy_id',null,'strategy',null)) end;
$$;
create or replace function public.pi_load_context(p_access jsonb,p_product_id uuid,p_revision bigint default null,
  p_key text default null,p_hash text default null,p_dry_run boolean default false,p_performance boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; current_rev bigint; snap jsonb; current_snap jsonb; receipt public.pi_idempotency_records;
begin
  owner_id := public.pi_authorize_context(p_access,case when p_key is null then 'product_intelligence:read' else 'product_intelligence:write' end);
  if p_performance then perform public.pi_authorize_context(p_access,'performance:read'); end if;
  perform 1 from public.products where id = p_product_id and user_id = owner_id and pi_deleting_at is null for share;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  perform public.pi_authorize_context(p_access,case when p_key is null then 'product_intelligence:read' else 'product_intelligence:write' end);
  if p_performance then perform public.pi_authorize_context(p_access,'performance:read'); end if;
  select revision into current_rev from public.product_intelligence where product_id = p_product_id;
  current_rev := coalesce(current_rev,0);
  current_snap := public.pi_context_snapshot(p_product_id);
  if p_key is not null and not p_dry_run then
    select * into receipt from public.pi_idempotency_records where user_id = owner_id and product_id = p_product_id
      and tool = 'save_product_context' and idempotency_key = p_key and expires_at > now();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      if not (p_access->'scopes' ?& receipt.required_scopes) then raise exception 'PI_FORBIDDEN'; end if;
      return jsonb_build_object('replay',receipt.result);
    end if;
  end if;
  if p_revision is null or p_revision = current_rev then snap := current_snap;
  else select snapshot into snap from public.pi_revisions where product_id = p_product_id and revision = p_revision;
    if not found then raise exception 'PI_NOT_FOUND'; end if;
  end if;
  return jsonb_build_object('revision',coalesce(p_revision,current_rev),'current_revision',current_rev,
    'snapshot',snap,'stamp',public.pi_snapshot_hash(current_snap));
end $$;
create or replace function public.pi_commit_context(p_access jsonb,p_product_id uuid,p_expected_revision bigint,p_stamp text,
  p_key text,p_hash text,p_context jsonb,p_pricing jsonb,p_base_image jsonb,p_result jsonb,p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; head_rev bigint; before_snap jsonb; after_snap jsonb; receipt public.pi_idempotency_records;
  proposed_rev bigint; changed boolean; plan public.product_pricing; image_id uuid;
begin
  owner_id := public.pi_authorize_context(p_access,'product_intelligence:write');
  perform 1 from public.products where id = p_product_id and user_id = owner_id and pi_deleting_at is null for update;
  if not found then raise exception 'PI_NOT_FOUND'; end if;
  perform public.pi_authorize_context(p_access,'product_intelligence:write');
  select revision into head_rev from public.product_intelligence where product_id = p_product_id;
  head_rev := coalesce(head_rev,0);
  if not p_dry_run then
    select * into receipt from public.pi_idempotency_records where user_id = owner_id and product_id = p_product_id
      and tool = 'save_product_context' and idempotency_key = p_key and expires_at > now();
    if found then
      if receipt.payload_hash is distinct from p_hash then raise exception 'PI_IDEMPOTENCY_KEY_REUSED'; end if;
      return receipt.result;
    end if;
  end if;
  if p_expected_revision is distinct from head_rev then raise exception 'PI_REVISION_CONFLICT'; end if;
  before_snap := public.pi_context_snapshot(p_product_id);
  if p_stamp is distinct from public.pi_snapshot_hash(before_snap) then raise exception 'PI_REVISION_CONFLICT'; end if;
  if p_context is not null and (jsonb_typeof(p_context) <> 'object' or
    p_context - array['display_name','category','description','supplier_text','base_reference_image_id','last_revision'] <> '{}'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_base_image is not null and (jsonb_typeof(p_base_image) <> 'object' or not (p_base_image ? 'id') or p_base_image - 'id' <> '{}'::jsonb) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_base_image is not null and p_base_image->'id' <> 'null'::jsonb then
    image_id := (p_base_image->>'id')::uuid;
    perform 1 from public.product_reference_images where id = image_id and product_id = p_product_id and user_id = owner_id for update;
    if not found then raise exception 'PI_INVALID_REFERENCE'; end if;
  end if;
  if p_result->>'ok' is distinct from 'true' or p_result->>'product_id' is distinct from p_product_id::text
    or (p_result->'data'->>'base_revision')::bigint is distinct from head_rev
    or (p_result->'data'->>'dry_run')::boolean is distinct from p_dry_run
    or length(p_result::text) > 60000 then raise exception 'PI_VALIDATION_ERROR'; end if;
  proposed_rev := (p_result->>'revision')::bigint;
  changed := not (p_result->'data'->>'no_op')::boolean;
  if proposed_rev is distinct from (head_rev + case when changed and not p_dry_run then 1 else 0 end)
    or (p_result->'data'->>'applied')::boolean is distinct from (changed and not p_dry_run) then raise exception 'PI_VALIDATION_ERROR'; end if;
  if p_dry_run then return p_result; end if;

  insert into public.product_intelligence(product_id,user_id) values(p_product_id,owner_id) on conflict(product_id) do nothing;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(p_product_id,owner_id,head_rev,before_snap,public.pi_snapshot_hash(before_snap),p_access->>'actor_id') on conflict do nothing;
  -- Los triggers de writers UI capturan una revisión al commit; esta RPC la captura explícitamente.
  perform set_config('pi.explicit_context_commit','true',true);
  if changed then
    if p_context is not null then
      insert into public.pi_product_inputs(product_id,user_id,display_name,category,description,supplier_text,last_revision,created_by,updated_by)
      values(p_product_id,owner_id,p_context->>'display_name',p_context->>'category',p_context->>'description',p_context->>'supplier_text',
        proposed_rev,p_access->>'actor_id',p_access->>'actor_id')
      on conflict(product_id) do update set display_name = excluded.display_name,category = excluded.category,
        description = excluded.description,supplier_text = excluded.supplier_text,last_revision = excluded.last_revision,
        updated_by = excluded.updated_by,updated_at = now();
    end if;
    if p_pricing is not null then
      if p_pricing->>'currency' is distinct from before_snap->'catalog'->>'currency' then raise exception 'PI_VALIDATION_ERROR'; end if;
      plan := jsonb_populate_record(null::public.product_pricing,p_pricing);
      insert into public.product_pricing(product_id,user_id,currency,unit_cost,avg_shipping_cost,purchase_cost_limit,confirmation_rate,
        delivery_rate,sale_price,compare_at_price,extra_unit_discount,minimum_price,recommended_price,profit,max_cpa,beroas,packs)
      values(p_product_id,owner_id,plan.currency,plan.unit_cost,plan.avg_shipping_cost,plan.purchase_cost_limit,plan.confirmation_rate,
        plan.delivery_rate,plan.sale_price,plan.compare_at_price,plan.extra_unit_discount,plan.minimum_price,plan.recommended_price,plan.profit,plan.max_cpa,plan.beroas,plan.packs)
      on conflict(product_id) do update set currency = excluded.currency,unit_cost = excluded.unit_cost,
        avg_shipping_cost = excluded.avg_shipping_cost,purchase_cost_limit = excluded.purchase_cost_limit,
        confirmation_rate = excluded.confirmation_rate,delivery_rate = excluded.delivery_rate,sale_price = excluded.sale_price,
        compare_at_price = excluded.compare_at_price,extra_unit_discount = excluded.extra_unit_discount,
        minimum_price = excluded.minimum_price,recommended_price = excluded.recommended_price,profit = excluded.profit,
        max_cpa = excluded.max_cpa,beroas = excluded.beroas,packs = excluded.packs,updated_at = now();
    end if;
    if p_base_image is not null then
      if p_base_image->'id' = 'null'::jsonb then
        update public.product_reference_images set is_base = false where product_id = p_product_id and user_id = owner_id and is_base;
      else perform public.set_base_reference_image(owner_id,p_product_id,image_id); end if;
    end if;
    after_snap := public.pi_context_snapshot(p_product_id);
    if after_snap = before_snap then raise exception 'PI_VALIDATION_ERROR'; end if;
    update public.product_intelligence set revision = proposed_rev,updated_at = now() where product_id = p_product_id;
    insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
      values(p_product_id,owner_id,proposed_rev,after_snap,public.pi_snapshot_hash(after_snap),p_access->>'actor_id');
    insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,client_id,base_revision,resulting_revision,diff)
      values(p_product_id,owner_id,(p_result->>'request_id')::uuid,'save_product_context',p_access->>'actor_id',
        (p_access->>'client_id')::uuid,head_rev,proposed_rev,p_result->'data'->'diff');
  end if;
  delete from public.pi_idempotency_records where user_id = owner_id and product_id = p_product_id
    and (expires_at <= now() or (tool = 'save_product_context' and idempotency_key = p_key));
  insert into public.pi_idempotency_records(product_id,user_id,tool,idempotency_key,payload_hash,required_scopes,result,resulting_revision,request_id)
    values(p_product_id,owner_id,'save_product_context',p_key,p_hash,array['product_intelligence:write'],p_result,proposed_rev,(p_result->>'request_id')::uuid);
  return p_result;
end $$;
create or replace function public.pi_capture_operational_context() returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid; owner_id uuid; rev bigint; snap jsonb; previous jsonb;
begin
  if current_setting('pi.explicit_context_commit',true) = 'true' then return null; end if;
  if tg_table_name = 'products' then target_id := coalesce(new.id,old.id); else target_id := coalesce(new.product_id,old.product_id); end if;
  select user_id,revision into owner_id,rev from public.product_intelligence where product_id = target_id;
  if not found then return null; end if;
  snap := public.pi_context_snapshot(target_id);
  if snap is null then return null; end if;
  select snapshot into previous from public.pi_revisions where product_id = target_id and revision = rev;
  previous := public.pi_normalize_knowledge_snapshot(previous);
  if snap = previous then return null; end if;
  if snap->'context' <> 'null'::jsonb and snap->'context' is distinct from previous->'context' then
    update public.pi_product_inputs set last_revision = rev+1,updated_by = owner_id::text,updated_at = now() where product_id = target_id;
    snap := public.pi_context_snapshot(target_id);
  end if;
  update public.product_intelligence set revision = rev+1,updated_at = now() where product_id = target_id;
  insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
    values(target_id,owner_id,rev+1,snap,public.pi_snapshot_hash(snap),owner_id::text);
  insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff)
    values(target_id,owner_id,gen_random_uuid(),'operational_context_changed',owner_id::text,rev,rev+1,'[]');
  return null;
end $$;
create or replace function public.pi_capture_owner_contexts() returns trigger language plpgsql security definer set search_path = '' as $$
declare row record; snap jsonb; previous jsonb;
begin
  for row in select * from public.product_intelligence where user_id = coalesce(new.user_id,old.user_id) order by product_id loop
    snap := public.pi_context_snapshot(row.product_id);
    select snapshot into previous from public.pi_revisions where product_id = row.product_id and revision = row.revision;
    previous := public.pi_normalize_knowledge_snapshot(previous);
    if snap is not null and snap is distinct from previous then
      update public.product_intelligence set revision = row.revision+1,updated_at = now() where product_id = row.product_id;
      insert into public.pi_revisions(product_id,user_id,revision,snapshot,snapshot_hash,actor_id)
        values(row.product_id,row.user_id,row.revision+1,snap,public.pi_snapshot_hash(snap),row.user_id::text);
      insert into public.pi_audit_events(product_id,user_id,request_id,operation,actor_id,base_revision,resulting_revision,diff)
        values(row.product_id,row.user_id,gen_random_uuid(),'owner_context_changed',row.user_id::text,row.revision,row.revision+1,'[]');
    end if;
  end loop;
  return null;
end $$;

-- Lecturas de dueño con RLS; comandos exclusivamente mediante RPC service_role.
do $$ declare t text; begin
 foreach t in array array['pi_personas','pi_jtbd','pi_pains','pi_desires','pi_objections','pi_angles','pi_customer_language','pi_offers','pi_sources','pi_facts','pi_fact_evidence','pi_angle_jtbd','pi_angle_pains','pi_angle_desires','pi_angle_facts','pi_objection_facts','pi_analysis_evidence','pi_strategy_versions','pi_strategy_events','pi_angle_proof_facts','pi_angle_objections'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to authenticated,service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
 execute format('create index on public.%I(product_id,user_id)',t);
 end loop;
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('pi_normalize_knowledge_snapshot','pi_evidence_hash','pi_knowledge_graph','pi_write_knowledge','pi_strategy_record','pi_operational_snapshot','pi_context_snapshot','pi_internal_references','pi_validate_knowledge','pi_load_knowledge','pi_commit_knowledge') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.pi_load_knowledge(jsonb,uuid,bigint,text,text,text,boolean,boolean,uuid) to service_role;
grant execute on function public.pi_commit_knowledge(jsonb,uuid,bigint,text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
