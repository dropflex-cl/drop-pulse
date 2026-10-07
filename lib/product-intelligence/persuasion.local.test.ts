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
import { landingExperienceSchema, type AnglePersuasionPlan, type LandingExperience } from "./persuasion-schemas";
import { resolveLandingExperience, runtimeExperience } from "./experience-resolver";
import type { ToolName, ToolOutputs } from "./schemas";
import { createMcpAuthenticator, type McpConfiguration } from "./oauth";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("PDP · integración transaccional local", () => {
  let db: SupabaseClient, owner: Principal, other: Principal, execute: ReturnType<typeof createProductIntelligenceExecutor>;
  let plan: AnglePersuasionPlan, experience: LandingExperience, planId: string, planEtag: string, planRevision: number, experienceId: string;
  const product = randomUUID(), image = randomUUID(), users: string[] = [];
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
    return {clientId,principal:auth.principal,runner:createProductIntelligenceExecutor(createContextRepository(db),auth.identity)};
  }
  async function planInput() {
    const read = await call("get_angle_persuasion_plan", {product_id:product, strategy_id:plan.strategy_id, angle_id:plan.angle_id, ...(planId ? {plan_id:planId}: {})});
    return {product_id:product, schema_version:"1.0", expected_revision:read.revision, expected_planning_stamp:read.data.planning_stamp, expected_etag:read.data.etag, plan_id:planId ?? null, idempotency_key:randomUUID(), plan};
  }
  async function experienceInput() {
    const r = await call("get_landing_experience", {product_id:product, ...(experienceId ? {experience_id:experienceId}: {})});
    return {product_id:product, schema_version:"1.0", expected_revision:r.revision, expected_planning_stamp:r.data.planning_stamp, expected_etag:r.data.etag, experience_id:experienceId ?? null, idempotency_key:randomUUID(), experience};
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
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321"); vi.stubEnv("PDP_PERSUASION_ENABLED","true");
    db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    execute=createProductIntelligenceExecutor(createContextRepository(db)); owner=await user(); other=await user();
    await checked(db.from("products").insert({id:product,user_id:owner.userId,title:"Organizador",shopify_product_id:product,currency:"CLP",pdp_persuasion_enabled:true}));
    await checked(db.from("product_reference_images").insert({id:image,product_id:product,user_id:owner.userId,source:"shopify",url:"https://cdn.shopify.com/local-fixture.webp",is_cover:true}));
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
  },30000);
  afterAll(async()=>{for(const id of users)await checked(db.auth.admin.deleteUser(id));for(const id of clients)await checked(db.auth.admin.oauth.deleteClient(id));vi.unstubAllEnvs();},20000);
  it("planning context consistente, catálogo real y validación sin escrituras",async()=>{
    const r=await call("get_pdp_planning_context",{product_id:product,strategy_id:plan.strategy_id,angle_id:plan.angle_id});
    expect(r.data.catalog).toHaveLength(17);expect(r.data.available_assets).toContainEqual({source:"reference",id:image,role:"hero"});
    expect(await call("validate_angle_persuasion_plan",{product_id:product,expected_revision:r.revision,plan})).toMatchObject({data:{valid:true}});
    expect(await count("pi_persuasion_plans")).toBe(0);
  });
  it("dry run, CAS concurrente, receipt antes de CAS y carga distinta rechazada",async()=>{
    const i=await planInput();
    expect(await call("save_angle_persuasion_plan",{...i,dry_run:true})).toMatchObject({data:{applied:false,id:null}});
    expect(await count("pi_pdp_revisions")).toBe(0);
    const race=await Promise.allSettled([call("save_angle_persuasion_plan",i),call("save_angle_persuasion_plan",{...i,idempotency_key:randomUUID()})]);
    // Creaciones distintas pueden coexistir: CAS de creación comparte empty etag pero el stamp incluye los heads.
    expect(race.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const saved=(race.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof call<"save_angle_persuasion_plan">>>>).value;
    planId=saved.data.id!;planEtag=saved.data.etag;planRevision=saved.data.revision;
    const winnerKey=(await checked(db.from("pi_idempotency_records").select("idempotency_key").eq("product_id",product).eq("tool","save_angle_persuasion_plan").single())).data!.idempotency_key;
    expect(await call("save_angle_persuasion_plan",{...i,idempotency_key:winnerKey})).toEqual(saved);
    await expect(call("save_angle_persuasion_plan",{...i,idempotency_key:winnerKey,plan:{...plan,landing_angle_id:"other"}})).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REUSED"});
    await expect(call("get_pdp_planning_context",{product_id:product,strategy_id:plan.strategy_id,angle_id:plan.angle_id},other)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(call("save_angle_persuasion_plan",i,{...owner,scopes:["product_intelligence:read"]})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("aprobación merchant, contenido native, metadata 1.2 y receipt conserva el etag",async()=>{
    plan={...plan,status:"approved"}; const saved=await call("save_angle_persuasion_plan",await planInput());planEtag=saved.data.etag;planRevision=saved.data.revision;
    const r=await call("get_landing_content",{product_id:product});
    const metadata={persuasion_plan_id:planId,angle_id:plan.angle_id,landing_angle_id:plan.landing_angle_id,landing_hook_id:null,section_key:"hero",belief_keys:["hero"],persuasion_job:"recognition",fact_ids:[],claim_keys:[]};
    const i={product_id:product,schema_version:"1.2",expected_revision:r.revision,expected_landing_etag:r.data.landing_etag,idempotency_key:randomUUID(),entries:entries.map(e=>e.component==="listing"?{...e,metadata}:e)};
    expect(await call("save_landing_content",{...i,dry_run:true})).toMatchObject({data:{applied:false}});
    const content=await call("save_landing_content",i);expect(await call("save_landing_content",i)).toEqual(content);
    expect((await call("get_landing_content",{product_id:product})).data.current!).not.toHaveProperty("metadata");
    const enriched=await call("get_landing_content",{product_id:product,schema_version:"1.2"});
    expect(enriched.data.contract_version).toBe("1.2");expect(enriched.data.current!.metadata).toEqual(metadata);
    for(const e of entries){
      const raw=(await checked(db.rpc("pi_load_landing",{p_access:contextAccess(owner),p_product_id:product}))).data;
      const row=raw.rows.find((r:{component:string})=>r.component===e.component);
      await checked(db.rpc("pi_review_landing",{p_access:contextAccess(owner),p_product_id:product,p_component:e.component,p_id:row.id,p_updated_at:row.updated_at,p_stamp:raw.stamp,p_patch:{approve:true,enabled:true}}));
    }
    experience=landingExperienceSchema.parse({schema_version:"1.0",strategy_id:plan.strategy_id,angle_id:plan.angle_id,persuasion_plan_id:planId,plan_revision:planRevision,landing_angle_id:plan.landing_angle_id,landing_hook_id:null,experience_key:"desk-default",architecture_variant:"reframe",status:"draft",sections:plan.sections.map(s=>({section_key:s.section_key,component:s.selected_component,content_variant_key:"default",enabled:true,persuasion_job:s.primary_job,belief_keys:s.belief_keys}))});
  });
  it("activa experiencia, resuelve angle, fija plan y conserva overrides",async()=>{
    experience={...experience,status:"active"};const i=await experienceInput();
    expect(await call("save_landing_experience",{...i,dry_run:true})).toMatchObject({data:{applied:false}});
    const saved=await call("save_landing_experience",i);experienceId=saved.data.id!;
    expect(await call("save_landing_experience",i)).toEqual(saved);
    await expect(call("save_landing_experience",{...i,idempotency_key:randomUUID()})).rejects.toMatchObject({code:"REVISION_CONFLICT"});
    const record=(await call("get_landing_experience",{product_id:product,experience_id:experienceId})).data.current!;
    const manifest={schema_version:"1.0",enabled:true,experiences:[runtimeExperience(record,product)]};
    expect(resolveLandingExperience(manifest,new URLSearchParams("angle=desk"))?.id).toBe(experienceId);
    expect(resolveLandingExperience(manifest,new URLSearchParams("angle=unknown"))).toBeNull();
    await expect(call("save_angle_persuasion_plan",{...await planInput(),expected_etag:planEtag})).rejects.toMatchObject({code:"DEPENDENCY_IN_USE"});
    expect((await db.from("pi_pdp_revisions").update({payload:{}}).eq("product_id",product)).error).toBeTruthy();
  });
  it("aprendizaje cita revisiones exactas sin inventar atribución; referencias inválidas rechazan",async()=>{
    const record=(await call("get_landing_experience",{product_id:product,experience_id:experienceId})).data.current!;
    const m=await call("get_product_performance",{product_id:product,from:"2026-10-01",through:"2026-10-06"});
    const learning={strategy_id:plan.strategy_id,hypothesis:"La arquitectura resuelve las dudas",criteria:"Observar compras",observation:"Sin medición de arquitectura",outcome:"inconclusive",limitations:["Sin atribución PDP"],next_action:"Recolectar observaciones",execution:{angle_id:plan.angle_id,persuasion_plan_id:planId,plan_revision:planRevision,experience_id:experienceId,experience_revision:record.revision,architecture_variant:experience.architecture_variant,measurement_attribution:"product_campaigns_only"}};
    const i={product_id:product,schema_version:"1.1",expected_revision:m.revision,from:m.data.from,through:m.data.through,expected_performance_etag:m.data.performance_etag,idempotency_key:randomUUID(),learning};
    await expect(call("save_product_learning",{...i,learning:{...learning,execution:{...learning.execution,architecture_variant:"wrong"}}})).rejects.toMatchObject({code:"INVALID_REFERENCE"});
    const saved=await call("save_product_learning",i);expect(await call("save_product_learning",i)).toEqual(saved);
  });
  it("OAuth real conserva overrides de copy y experiencia; revocar impide incluso replay",async()=>{
    const agent=await delegated();
    await expect(call("save_landing_experience",await experienceInput(),agent.principal,agent.runner)).rejects.toMatchObject({code:"FORBIDDEN"});
    experience={...experience,sections:experience.sections.map(s=>s.component==="listing"?{...s,manual_overrides:["content"]}:s)};
    await call("save_landing_experience",await experienceInput());
    const removed={...experience,status:"draft",sections:experience.sections.map(s=>({...s,manual_overrides:[]}))};
    await expect(call("save_landing_experience",{...await experienceInput(),experience:removed},agent.principal,agent.runner)).rejects.toMatchObject({code:"DEPENDENCY_IN_USE"});
    const landing=await call("get_landing_content",{product_id:product});
    await expect(call("save_landing_content",{product_id:product,schema_version:"1.1",expected_revision:landing.revision,expected_landing_etag:landing.data.landing_etag,idempotency_key:randomUUID(),entries:[{component:"listing",content:{...listing,title:"Otro título para el organizador"}}]},agent.principal,agent.runner)).rejects.toMatchObject({code:"DEPENDENCY_IN_USE"});
    const newPlan={...await planInput(),plan_id:null,expected_etag:(await call("get_landing_experience",{product_id:product})).data.etag,plan:{...plan,status:"draft"}};
    const saved=await call("save_angle_persuasion_plan",newPlan,agent.principal,agent.runner);expect(saved.data.applied).toBe(true);
    await checked(db.from("pi_access_grants").update({revoked_at:new Date().toISOString()}).eq("user_id",owner.userId).eq("client_id",agent.clientId));
    await expect(call("save_angle_persuasion_plan",newPlan,agent.principal,agent.runner)).rejects.toMatchObject({code:"FORBIDDEN"});
  },20000);
  it("ACL cerrado, rollback de referencia ajena y cascada completa",async()=>{
    const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    expect((await anon.rpc("pi_load_persuasion",{p_access:contextAccess(owner),p_product_id:product})).error?.code).toBe("42501");
    const before=await count("pi_pdp_revisions");
    await expect(call("save_landing_experience",{...await experienceInput(),experience:{...experience,sections:experience.sections.map(s=>({...s,asset_refs:[{source:"reference",id:randomUUID(),role:"hero"}]}))}})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
    const record=(await call("get_landing_experience",{product_id:product,experience_id:experienceId})).data.current!;
    const raw=(await checked(db.rpc("pi_load_persuasion",{p_access:contextAccess(owner),p_product_id:product,p_strategy_id:plan.strategy_id}))).data;
    const revision=(await call("get_landing_experience",{product_id:product})).revision;
    const forged=await db.rpc("pi_commit_persuasion",{p_access:contextAccess(owner),p_product_id:product,p_tool:"save_landing_experience",p_id:experienceId,
      p_expected_revision:revision,p_etag:record.etag,p_stamp:raw.planning_stamp,p_key:randomUUID(),p_hash:"a".repeat(64),p_issues:[],
      p_payload:{...experience,sections:experience.sections.map(s=>({...s,asset_refs:[{source:"reference",id:randomUUID(),role:"hero"}]}))}});
    expect(forged.error?.message).toBe("PI_INVALID_REFERENCE");
    expect(await count("pi_pdp_revisions")).toBe(before);
    await checked(db.auth.admin.deleteUser(owner.userId));users.splice(users.indexOf(owner.userId),1);
    for(const table of ["pi_persuasion_plans","pi_landing_experiences","pi_pdp_revisions","pi_product_learnings"])expect(await count(table)).toBe(0);
  });
});
