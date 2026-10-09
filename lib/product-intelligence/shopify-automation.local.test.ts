/** Opt-in: fixtures locales, sin IA, tienda ni campañas externas. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createContextRepository, contextAccess } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { requestFixture } from "./test-fixtures";
import { persuasionPlanFixture } from "./persuasion-fixtures";
import { landingExperienceSchema, type AnglePersuasionPlan } from "./persuasion-schemas";
import sharp from "sharp";
import { visualFixture } from "./visual-fixtures";
import { visualRecordSchema, type VisualRecord } from "./visual-schemas";
import { runVisualIngestion } from "./visual-operations";
import type { ToolName, ToolOutputs } from "./schemas";
import { createMcpAuthenticator, type McpConfiguration } from "./oauth";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("Shopify automático · consentimiento real y transacciones locales", () => {
 let db: SupabaseClient,owner: Principal,execute: ReturnType<typeof createProductIntelligenceExecutor>,plan: AnglePersuasionPlan;
 let originalAuthorization: Awaited<ReturnType<typeof authorize>>;
 let chat: Awaited<ReturnType<typeof delegated>>,identity: VisualRecord,visualPlan: VisualRecord,asset: VisualRecord;
 const product=randomUUID(),image=randomUUID(),users:string[]=[],paths:string[]=[];
  const credentials=new Map<string,{email:string;password:string}>(), clients:string[]=[];
  async function checked<T extends {error: unknown}>(op: PromiseLike<T>) { const r = await op; if (r.error) throw new Error(JSON.stringify(r.error)); return r; }
  async function call<K extends ToolName>(tool: K, input: unknown, principal = owner, runner = execute) {
    const r = parseToolOutput(tool, await runner(principal, {tool, input: parseToolInput(tool, input)} as Parameters<typeof execute>[1], AbortSignal.timeout(15000)));
    if (!r.ok) throw r; return r as ToolOutputs[K] & {ok:true};
  }
  async function count(table: string) { return (await checked(db.from(table).select("*", {count:"exact", head:true}).eq("product_id", product))).count; }
  async function user(): Promise<Principal> {
    const login={email:`pdp-${randomBytes(8).toString("hex")}@example.test`,password:randomBytes(32).toString("base64url")};
    const created = await checked(db.auth.admin.createUser({...login, email_confirm:true}));
    const id = created.data.user!.id; users.push(id);
    credentials.set(id,login);
    await checked(db.from("merchant_settings").insert({user_id:id, country_code:"CL", currency:"CLP", language:"es", timezone:"America/Santiago", market_confirmed_at:new Date().toISOString()}));
    return {userId:id, actorId:id, actorKind:"merchant", scopes:PI_SCOPES};
  }
  async function delegated(){
    const config:McpConfiguration={resourceUrl:"http://localhost:3000/api/mcp",issuer:"http://127.0.0.1:55321/auth/v1",jwksUrl:"http://127.0.0.1:55321/auth/v1/.well-known/jwks.json",allowedOrigins:["http://localhost:3000"]};
    const merchant=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const login=await checked(merchant.auth.signInWithPassword(credentials.get(owner.userId)!));
    const registered=await checked(db.auth.admin.oauth.createClient({client_name:"PDP local test",redirect_uris:["http://localhost:3000/pi-test-callback"],grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none",scope:"email offline_access"}));
    const clientId=registered.data!.client_id;clients.push(clientId);
    const verifier=randomBytes(32).toString("base64url"),challenge=createHash("sha256").update(verifier).digest("base64url");
    const response=await fetch(`${config.issuer}/oauth/authorize?${new URLSearchParams({response_type:"code",client_id:clientId,redirect_uri:"http://localhost:3000/pi-test-callback",scope:"email offline_access",resource:config.resourceUrl,code_challenge:challenge,code_challenge_method:"S256",prompt:"consent"})}`,{redirect:"manual",headers:{Authorization:`Bearer ${login.data.session!.access_token}`}});
    expect(response.status).toBe(302);const authorizationId=new URL(response.headers.get("location")!).searchParams.get("authorization_id")!;
    await checked(merchant.auth.oauth.getAuthorizationDetails(authorizationId));
    await checked(db.rpc("pi_prepare_oauth_grant",{p_user_id:owner.userId,p_client_id:clientId,p_authorization_id:authorizationId,p_resource_url:config.resourceUrl,p_scopes:PI_SCOPES}));
    const consent=await checked(merchant.auth.oauth.approveAuthorization(authorizationId,{skipBrowserRedirect:true}));
    await checked(db.rpc("pi_activate_oauth_grant",{p_user_id:owner.userId,p_client_id:clientId,p_authorization_id:authorizationId}));
    const tokenResponse=await fetch(`${config.issuer}/oauth/token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:clientId,code:new URL(consent.data!.redirect_url).searchParams.get("code")!,code_verifier:verifier,redirect_uri:"http://localhost:3000/pi-test-callback",resource:config.resourceUrl})});
    expect(tokenResponse.ok).toBe(true);const bearer=(await tokenResponse.json()).access_token;
    const authenticate=createMcpAuthenticator(config,async identity=>(await checked(db.rpc("pi_check_oauth_grant",{p_user_id:identity.userId,p_client_id:identity.clientId,p_session_id:identity.sessionId,p_token_session_id:identity.tokenSessionId,p_version:identity.grantVersion,p_resource_url:identity.resourceUrl}))).data);
    const auth=await authenticate(new Request(config.resourceUrl,{headers:{Authorization:`Bearer ${bearer}`}}));
    return {clientId,identity:auth.identity,principal:auth.principal,runner:createProductIntelligenceExecutor(createContextRepository(db),auth.identity)};
  }

 async function policy(access=contextAccess(chat.principal,chat.identity)) { return (await checked(db.rpc("pi_shopify_automation",{p_access:access,p_product_id:product,p_action:"read"}))).data; }
 async function authorize(dry_run=false,key=randomUUID()) {
  const strategy=(await checked(db.from("pi_strategy_versions").select("snapshot").eq("id",plan.strategy_id).single())).data!;
  return {product_id:product,expected_revision:(await policy()).revision,idempotency_key:key,dry_run,strategy_id:plan.strategy_id,
   confirmed_hooks:strategy.snapshot.angles.map((a:{id:string;hook:string})=>({angle_id:a.id,hook:a.hook})),auto_approve_and_publish:true};
 }
 async function visualWrite() {
  const r=(await checked(db.rpc("pi_load_visual",{p_access:contextAccess(chat.principal,chat.identity),p_product_id:product}))).data;
  return {product_id:product,schema_version:"1.0",expected_revision:r.revision,expected_etag:r.etag,expected_dependency_stamp:r.dependency_stamp,idempotency_key:randomUUID()};
 }
  const listing = {title:"Organizador para tu escritorio",short_name:"Organizador",short_description:"Separa tus útiles en los compartimentos del organizador.",offer_line:"Ordena tu escritorio · Paga al recibir",seo_title:"Organizador para escritorio",seo_description:"Ordena los útiles de tu escritorio y encuentra cada cosa en su lugar. Paga al recibir en casa."};
  const entries = [
    {component:"listing",content:listing},
    {component:"image-with-benefits",content:[{key:"default",angle_id:null,hook_id:null,images:[{slot:"main",source:"reference",id:image}],content:{heading:"¿Por qué este organizador?",benefits:[
      {icon:"target",title:"Útiles separados",body:"Sus compartimentos separan los útiles sobre la mesa para encontrar cada cosa."},
      {icon:"eye",title:"Todo a la vista",body:"Deja los útiles a la vista sobre la mesa mientras trabajas en tu escritorio."},
      {icon:"hand",title:"Un espacio propio",body:"Cada compartimento da un espacio a los útiles que necesitas tener cerca."},
      {icon:"clock",title:"Orden cotidiano",body:"Reúne tus útiles en el organizador al terminar de trabajar en el escritorio."},
    ]}}]},
    {component:"pain-block",content:{heading:"¿Dónde quedó lo que buscabas?",moments:[{slot:1,title:"Buscar entre los útiles",text:"Quienes mezclan los útiles sobre la mesa pierden de vista lo que necesitan."}],bridge:"Los compartimentos del organizador dan un espacio a cada útil."}},
    {component:"faq-and-text",content:{heading:"Resuelve tus dudas antes de pedir",items:[
      {topic:"envio",question:"¿Cuánto demora en llegar?",answer:"Consulta el plazo disponible al confirmar tu dirección de entrega."},
      {topic:"uso",question:"¿Cómo uso el organizador?",answer:"Separa tus útiles entre los compartimentos y déjalo sobre tu escritorio."},
      {topic:"garantia",question:"¿Qué hago si llega con una falla?",answer:"Escríbenos para revisar el caso y aplicar la garantía legal correspondiente."},
    ]}},
  ];

 const chatCall=<K extends ToolName>(tool:K,input:unknown)=>call(tool,input,chat.principal,chat.runner);
 beforeAll(async()=>{
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");vi.stubEnv("PDP_PERSUASION_ENABLED","true");
  db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  execute=createProductIntelligenceExecutor(createContextRepository(db));owner=await user();
  await checked(db.from("products").insert({id:product,user_id:owner.userId,title:"Organizador",shopify_product_id:product,currency:"CLP",pdp_persuasion_enabled:false}));
  const path=`${owner.userId}/${product}/base.webp`;paths.push(path);
  const bytes=await sharp({create:{width:600,height:600,channels:3,background:{r:20,g:20,b:20}}}).webp().toBuffer();
  await checked(db.storage.from("product-references").upload(path,bytes,{contentType:"image/webp"}));
  await checked(db.from("product_reference_images").insert({id:image,product_id:product,user_id:owner.userId,source:"upload",storage_path:path,mime_type:"image/webp",is_base:true,is_cover:true}));
    const env=(revision:number)=>({product_id:product,schema_version:"1.0",expected_revision:revision,idempotency_key:randomUUID()});
    const research=await call("save_research",{...requestFixture("propose-research").payload as object,...env(0)}), fact=research.data.id_map.compartments_fact;
    await call("save_product_context",{...env(1),context:{display_name:"Organizador",description:"Organizador con compartimentos.",base_reference_image_id:image},pricing:{mode:"recommended",unit_cost_minor:4000}});
    const analysis=JSON.parse(JSON.stringify(requestFixture("analysis-four-personas").payload).replaceAll("00000000-0000-0000-0000-00000000000b",fact));
    const result=await call("save_product_analysis",{...analysis,...env(2)}), map=result.data.id_map;
    await call("save_research",{...env(3),facts:[{id:fact,verification_status:"verified",usage_status:"approved",reason:"Verificado en fuente ficticia."}]});
    const selected=await call("set_product_strategy",{...env(4),based_on_revision:4,action:"select",primary_persona_id:map.persona_1,primary_jtbd_id:map.job_1,primary_pain_id:map.pain_1,primary_angle_id:map.angle_1_1,secondary_angle_ids:[],offer_id:map.offer_main,positioning:"Orden cotidiano",rationale:"Hipótesis para probar."});
    plan=persuasionPlanFixture(); plan.strategy_id=selected.data.strategy!.id; plan.angle_id=map.angle_1_1;
    plan.audience_state.persona_id=map.persona_1; plan.audience_state.primary_jtbd_ids=[map.job_1]; plan.audience_state.primary_pain_ids=[map.pain_1];
  plan.sections[2]={...plan.sections[2],selected_component:"pain-block",candidate_components:["pain-block"],primary_job:"reframe",preferred_medium:"visual_led"};
  chat=await delegated();
 },40000);
 afterAll(async()=>{
  if(!db)return;
  for(const bucket of ["product-references","page-media"]) { const listed=await db.storage.from(bucket).list(`${owner.userId}/${product}`,{limit:1000});if(listed.data?.length)await checked(db.storage.from(bucket).remove(listed.data.map(f=>`${owner.userId}/${product}/${f.name}`))); }
  for(const id of users)await checked(db.auth.admin.deleteUser(id));for(const id of clients)await checked(db.auth.admin.oauth.deleteClient(id));vi.unstubAllEnvs();
 },20000);
 it("sin elección exacta no autoriza; dry run no crea consentimiento",async()=>{
  expect(await policy()).toMatchObject({enabled:false,active:false});
  const i=await authorize();originalAuthorization=i;
  await expect(chatCall("authorize_shopify_automation",{...i,confirmed_hooks:[{...i.confirmed_hooks[0],hook:"Otro hook"}]})).rejects.toMatchObject({code:"INVALID_REFERENCE"});
  expect(await chatCall("authorize_shopify_automation",{...i,dry_run:true})).toMatchObject({data:{active:false}});
  expect(await count("pi_shopify_automations")).toBe(0);
  const r=await chatCall("authorize_shopify_automation",i);expect(r).toMatchObject({revision:i.expected_revision+1,data:{active:true}});
  expect(await chatCall("authorize_shopify_automation",i)).toMatchObject({data:{active:true}});
  expect((await policy(contextAccess(owner))).active).toBe(false);
 });
 it("el chat aprueba packs y copy; sus cambios no invalidan el hook autorizado",async()=>{
  const packs=await chatCall("get_pack_labels",{product_id:product});
  const labels=[1,2,3].map(units=>({units,label:units===1?"Uno para ti":units===2?"Uno para ti y otro para regalar":"Para compartir",reason:"Comparte el organizador.",basis:"sharing",support:null,badge:null}));
  const r=await chatCall("save_pack_labels",{product_id:product,expected_revision:packs.revision,schema_version:"1.0",expected_pack_labels_etag:packs.data.pack_labels_etag,idempotency_key:randomUUID(),labels});
  expect(r).toMatchObject({data:{status:"approved"}});expect((await policy()).active).toBe(true);
  const landing=await chatCall("get_landing_content",{product_id:product});
  const copy=await chatCall("save_landing_content",{product_id:product,schema_version:"1.1",expected_revision:landing.revision,expected_landing_etag:landing.data.landing_etag,idempotency_key:randomUUID(),entries:[{component:"listing",content:{title:"Organizador para tu escritorio",short_name:"Organizador",short_description:"Separa tus útiles en los compartimentos del organizador.",offer_line:"Ordena tu escritorio · Paga al recibir",seo_title:"Organizador para escritorio",seo_description:"Ordena los útiles de tu escritorio y encuentra cada cosa en su lugar. Paga al recibir en casa."}}]});
  expect(copy.data.components[0].status).toBe("approved");
  const row=(await checked(db.from("page_components").select("enabled,status,decided_at").eq("id",copy.data.components[0].id).single())).data!;
  expect(row).toMatchObject({enabled:true,status:"approved"});expect(row.decided_at).toBeTruthy();expect((await policy()).active).toBe(true);
 });
 it("identidad y plan PDP se aprueban sin UI; genera y selecciona una portada desde el chat",async()=>{
  const ref=(await chatCall("get_visual_generation_context",{product_id:product})).data.canonical_reference!;
  const proposal = { ...visualFixture().identityInput, canonical_reference_image_id: image, reference_content_hash: ref.content_hash };
  // Una propuesta previa existe antes de continuar en el modo automático autorizado.
  const previous = await call("save_visual_identity", { ...await visualWrite(), identity: proposal });
  const previousIdentity = visualRecordSchema.parse(previous.data.records[0]); expect(previousIdentity.status).toBe("review");
  const saved=await chatCall("save_visual_identity",{...await visualWrite(),identity:proposal});
  identity=visualRecordSchema.parse((saved.data.records as unknown[])[0]);expect(identity.status).toBe("approved"); expect(identity.version).toBe(previousIdentity.version + 1);
  const value=visualFixture().plan;value.strategy_id=plan.strategy_id;value.identity_ref={id:identity.id,version:identity.version,etag:identity.etag};value.shots[0].angle_id=plan.angle_id;
  visualPlan=visualRecordSchema.parse((await chatCall("save_visual_generation_plan",{...await visualWrite(),plan:value})).data.records[0]);expect(visualPlan.status).toBe("approved");
  const it=visualRecordSchema.parse((await chatCall("prepare_visual_iteration",{...await visualWrite(),plan_ref:{id:visualPlan.id,version:visualPlan.version,etag:visualPlan.etag},shot_key:"hero",source_system:"chatgpt",resolved_instruction:"Conserva el organizador de referencia"})).data.records[0]);
  const bytes=await sharp({create:{width:800,height:800,channels:3,background:{r:20,g:25,b:30}}}).png().toBuffer();
  const ticket=await chatCall("prepare_visual_asset_upload",{...await visualWrite(),iteration_id:it.id,mime_type:"image/png",size_bytes:bytes.length});
  const upload=ticket.data.upload as {path:string;token:string};await checked(db.storage.from("page-media").uploadToSignedUrl(upload.path,upload.token,bytes,{contentType:"image/png"}));
  const ingested=await chatCall("ingest_external_visual_asset",{...await visualWrite(),iteration_id:it.id,source:{type:"upload_ticket",ticket_id:ticket.data.operation_id}});
  await runVisualIngestion(String(ingested.data.operation_id));
  asset=visualRecordSchema.parse((await chatCall("list_visual_assets",{product_id:product})).data.items[0]);expect(asset.status).toBe("generated");
  asset=visualRecordSchema.parse((await chatCall("review_visual_record",{...await visualWrite(),record_id:asset.id,decision:"approve",reason:"La fixture conserva la identidad",tags:["good_product_fidelity"]})).data.records[0]);expect(asset.status).toBe("approved");
  const target=(await chatCall("get_visual_generation_context",{product_id:product})).data.targets.find(t=>t.key==="gallery:cover")!;
  const binding=visualRecordSchema.parse((await chatCall("bind_visual_asset",{...await visualWrite(),asset_id:asset.id,bindings:[{target:target.value.target,target_etag:target.etag}]})).data.records[0]);
  await chatCall("review_visual_record",{...await visualWrite(),record_id:binding.id,decision:"select",reason:"Portada de prueba"});
  expect((await checked(db.from("page_images").select("status,slot").eq("visual_binding_id",binding.id).single())).data).toMatchObject({status:"approved",slot:"cover"});
  expect((await policy()).active).toBe(true);
 },30000);
 it("el chat aprueba el recorrido y activa la experiencia después de sus componentes",async()=>{
  plan={...plan,status:"approved"};
  const ctx=await chatCall("get_angle_persuasion_plan",{product_id:product,strategy_id:plan.strategy_id,angle_id:plan.angle_id});
  const saved=await chatCall("save_angle_persuasion_plan",{product_id:product,schema_version:"1.0",expected_revision:ctx.revision,expected_planning_stamp:ctx.data.planning_stamp,expected_etag:ctx.data.etag,plan_id:null,idempotency_key:randomUUID(),plan});
  const landing=await chatCall("get_landing_content",{product_id:product});
  await chatCall("save_landing_content",{product_id:product,schema_version:"1.1",expected_revision:landing.revision,expected_landing_etag:landing.data.landing_etag,idempotency_key:randomUUID(),entries});
  const expCtx=await chatCall("get_landing_experience",{product_id:product});
  const experience=landingExperienceSchema.parse({schema_version:"1.0",strategy_id:plan.strategy_id,angle_id:plan.angle_id,persuasion_plan_id:saved.data.id,plan_revision:saved.data.revision,landing_angle_id:plan.landing_angle_id,landing_hook_id:null,experience_key:"desk-default",architecture_variant:"reframe",status:"active",is_default:true,sections:plan.sections.map(s=>({section_key:s.section_key,component:s.selected_component,content_variant_key:"default",enabled:true,persuasion_job:s.primary_job,belief_keys:s.belief_keys}))});
  const activated=await chatCall("save_landing_experience",{product_id:product,schema_version:"1.0",expected_revision:expCtx.revision,expected_planning_stamp:expCtx.data.planning_stamp,expected_etag:expCtx.data.etag,experience_id:null,idempotency_key:randomUUID(),experience});
  expect((await chatCall("get_landing_experience",{product_id:product,experience_id:activated.data.id})).data.current!.payload).toMatchObject({status:"active"});expect((await policy()).active).toBe(true);
  const readiness=await chatCall("get_shopify_automation",{product_id:product});expect(readiness.data).toMatchObject({active:true,publish_ready:false});expect(readiness.data.fingerprint).toHaveLength(32);expect(readiness.data.missing.length).toBeGreaterThan(0);
 });
 it("precio/mercado cambiado invalida la autorización; read-only no concede decisiones",async()=>{
  expect((await policy({...contextAccess(chat.principal,chat.identity),scopes:["product_intelligence:read"]})).active).toBe(false);
  await checked(db.from("products").update({currency:"USD"}).eq("id",product));expect((await policy()).active).toBe(false);
  await expect(chatCall("review_visual_record",{...await visualWrite(),record_id:asset.id,decision:"approve"})).rejects.toMatchObject({code:"FORBIDDEN"});
  await checked(db.from("products").update({currency:"CLP"}).eq("id",product));expect((await policy()).active).toBe(true);
 });
 it("colas idempotentes, lease y revocación real impiden publicar sin autorización",async()=>{
  const state=await policy(),access=contextAccess(chat.principal,chat.identity),key=randomUUID();
  const args={p_access:access,p_product_id:product,p_action:"publish",p_expected_revision:state.revision,p_key:key,p_hash:"a".repeat(64),p_payload:{authorization_id:state.authorization_id,fingerprint:"b".repeat(32),shop_domain:"fixture.myshopify.com"}};
  const queued=(await checked(db.rpc("pi_shopify_automation",args))).data;
  expect(queued.status).toBe("queued");expect((await checked(db.rpc("pi_shopify_automation",args))).data.operation_id).toBe(queued.operation_id);
  const token=randomUUID();expect((await checked(db.rpc("pi_claim_shopify_publication",{p_id:queued.operation_id,p_token:token}))).data).toBeTruthy();
  expect((await checked(db.rpc("pi_claim_shopify_publication",{p_id:queued.operation_id,p_token:randomUUID()}))).data).toBeNull();
  expect((await checked(db.rpc("pi_guard_shopify_publication",{p_id:queued.operation_id,p_token:token}))).data).toBe(true);
  const consent=await authorize();
  await chatCall("disable_shopify_automation",{product_id:product,expected_revision:state.revision,idempotency_key:randomUUID()});
  expect((await checked(db.rpc("pi_guard_shopify_publication",{p_id:queued.operation_id,p_token:token}))).data).toBe(false);
  expect(await chatCall("authorize_shopify_automation",originalAuthorization)).toMatchObject({data:{enabled:false,active:false}});
  await checked(db.rpc("pi_finish_shopify_publication",{p_id:queued.operation_id,p_token:token,p_error:"Desactivado por el comerciante"}));
  await chatCall("authorize_shopify_automation",{...consent,expected_revision:(await policy()).revision});
  expect((await policy()).active).toBe(true);
  await checked(db.rpc("pi_revoke_oauth_grant",{p_user_id:owner.userId,p_client_id:chat.clientId}));
  await expect(chatCall("authorize_shopify_automation",consent)).rejects.toMatchObject({code:"FORBIDDEN"});
 });
});
