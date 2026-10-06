/** Fixtures locales, sin llamadas pagadas ni publicación. */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createContextRepository, contextAccess } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { requestFixture } from "./test-fixtures";
import { reviewUsageTip } from "./content-service";
import type { ToolName } from "./schemas";
import { saveBasicContext, saveProductData } from "@/lib/pipeline/product-data";
import { runGalleryOperation } from "@/lib/page-images/operations";
import { deleteProducts } from "@/lib/products/delete";
import { startRender, processAsset } from "@/lib/pipeline/creatives";
import { processImage } from "@/lib/pipeline/page-images";
import { HiggsfieldError, submit } from "@/lib/integrations/higgsfield/client";
vi.mock("@/lib/pipeline/creatives", async (actual) => ({ ...await actual<typeof import("@/lib/pipeline/creatives")>(), requireProvider: vi.fn(async (_user, _stage, _what, provider) => provider) }));
vi.mock("@/lib/integrations/higgsfield/connection", () => ({ higgsfieldKey: vi.fn(async () => "fixture-no-provider-call"), getHiggsfieldConnection: vi.fn(async () => ({status:"connected"})), markHiggsfieldInvalid: vi.fn() }));
vi.mock("@/lib/integrations/higgsfield/client", async (actual) => ({ ...await actual<typeof import("@/lib/integrations/higgsfield/client")>(), submit: vi.fn(), uploadImage: vi.fn(async () => "https://example.test/reference") }));
vi.mock("@/lib/pipeline/images", async (actual) => ({ ...await actual<typeof import("@/lib/pipeline/images")>(), download: vi.fn(async () => Buffer.from("fixture")), toJpeg: vi.fn(async bytes => bytes) }));
const local = process.env.PI_LOCAL_TEST === "1" ? describe : describe.skip;
local("PI · contenido y aprendizaje transaccionales", () => {
  let db: SupabaseClient, owner: Principal, other: Principal, product: string, strategy: string, angle: string, fact: string;
  let execute: ReturnType<typeof createProductIntelligenceExecutor>;
  const users: string[] = [];
  const signal = () => AbortSignal.timeout(10000);
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>): Promise<T> { const r=await op; if(r.error) throw r.error; return r; }
  async function user() {
    const r = await checked(db.auth.admin.createUser({ email: `content-${randomBytes(8).toString("hex")}@example.test`, password: randomBytes(32).toString("base64url"), email_confirm: true }));
    const id=r.data.user!.id; users.push(id);
    await checked(db.from("merchant_settings").insert({ user_id:id,country_code:"CL",currency:"CLP",language:"es",timezone:"America/Santiago",market_confirmed_at:new Date().toISOString() }));
    return { userId:id,actorId:id,actorKind:"merchant",scopes:PI_SCOPES } as Principal;
  }
  async function call<K extends ToolName>(tool: K, input: unknown, principal=owner) { return parseToolOutput(tool,await execute(principal,{tool,input:parseToolInput(tool,input)} as Parameters<typeof execute>[1],signal())); }
  async function count(table: string) { return (await checked(db.from(table).select("*",{count:"exact",head:true}).eq("product_id",product))).count; }
  async function input(tool: "get_creative_content"|"get_gallery_content"|"get_event_content"|"get_usage_tip") {
    const r=await call(tool,{product_id:product}); if(!r.ok) throw r;
    return { product_id:product,schema_version:"1.0",expected_revision:r.revision,expected_content_etag:r.data.content_etag,idempotency_key:randomUUID() };
  }
  const art={palette:"warm white, graphite",typography:"clear sans",mood:"natural and calm"};
  function creative() { return {strategy_id:strategy,angle_ids:[angle],fact_ids:[fact],product_look:"A desktop organizer",kit:[],concepts:[{
    execution_key:"desk-a",landing_angle_id:"desk",landing_hook_id:"lost-pencil",angle_id:angle,family:"hero",name:"Escritorio ordenado",idea:"Muestra los compartimentos",why:"Explica la organización",look:"El producto sobre una mesa",art,
    scene:"The organizer on a desk in natural light.",layout:"The product in the center and the headline above.",product_units:1,kit_parts:[],chat:null,
    texts:[{role:"headline",text:"Ordena tu escritorio",placement:"Top, large clear sans",points_to:null}]}]}; }
  function gallery() {
    const shot={slot:"gallery",benefit:null,type:"hero_mood",name:"Ambiente",look:"El producto en su entorno",art,scene:"An organizer on a desk",layout:"The product fills the middle",product_units:1,kit_parts:[],hands:false,texts:[]};
    return {strategy_id:strategy,angle_ids:[angle],fact_ids:[fact],plan:{product_look:"A desktop organizer",kit:[],visual_world:"studio_color",visual_world_why:"Muestra el producto con claridad",brand_art:art,props_allowed:[],props_forbidden:[],
      benefits:[{text:"Separa tus útiles",angle:1},{text:"Encuentra cada cosa",angle:null},{text:"Ordena tu mesa",angle:null}],
      shots:[{...shot,slot:"cover",type:"hero_clean"},...Array.from({length:5},()=>shot),...Array.from({length:3},(_,i)=>({...shot,slot:"benefit",type:"benefit",benefit:i+1}))]}};
  }
  async function metrics() { const r=await call("get_product_performance",{product_id:product,from:"2026-10-01",through:"2026-10-06"});if(!r.ok)throw r;return r; }
  beforeAll(async()=>{
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    execute=createProductIntelligenceExecutor(createContextRepository(db));owner=await user();other=await user();
  });
  beforeEach(async()=>{
    vi.mocked(submit).mockReset();
    product=randomUUID();const image=randomUUID();
    await checked(db.from("products").insert({id:product,user_id:owner.userId,shopify_product_id:product,title:"Organizador",currency:"CLP",image_qa:false}));
    await checked(db.from("product_reference_images").insert({id:image,product_id:product,user_id:owner.userId,source:"shopify",url:"https://cdn.shopify.com/local-fixture.webp",is_cover:true}));
    const env=(revision:number)=>({product_id:product,schema_version:"1.0",expected_revision:revision,idempotency_key:randomUUID()});
    const research=await call("save_research",{...requestFixture("propose-research").payload as object,...env(0)});if(!research.ok)throw research;
    fact=research.data.id_map.compartments_fact;
    await call("save_product_context",{...env(1),context:{display_name:"Organizador",description:"Organizador con compartimentos.",base_reference_image_id:image},pricing:{mode:"recommended",unit_cost_minor:4000}});
    const analysis=JSON.parse(JSON.stringify(requestFixture("analysis-four-personas").payload).replaceAll("00000000-0000-0000-0000-00000000000b",fact));
    const result=await call("save_product_analysis",{...analysis,...env(2)});if(!result.ok)throw result;const map=result.data.id_map;
    await call("save_research",{...env(3),facts:[{id:fact,verification_status:"verified",usage_status:"approved",reason:"Verificado en la fuente ficticia."}]});
    const selected=await call("set_product_strategy",{...env(4),based_on_revision:4,action:"select",primary_persona_id:map.persona_1,primary_jtbd_id:map.job_1,primary_pain_id:map.pain_1,primary_angle_id:map.angle_1_1,secondary_angle_ids:[],offer_id:map.offer_main,positioning:"Orden cotidiano",rationale:"Hipótesis para probar."});
    if(!selected.ok||!selected.data.strategy)throw selected;
    strategy=selected.data.strategy.id;angle=map.angle_1_1;
  });
  afterAll(async()=>{for(const id of users)await checked(db.auth.admin.deleteUser(id));},20000);

  it("guarda estáticos sin IA, replay antes de CAS y preserva propuestas previas",async()=>{
    const i={...await input("get_creative_content"),content:creative()};
    expect(await call("save_creative_content",{...i,dry_run:true})).toMatchObject({data:{applied:false,artifact_ids:[]}});
    expect(await count("creative_concepts")).toBe(0);
    const r=await call("save_creative_content",i); expect(r).toMatchObject({revision:6,data:{applied:true}});
    expect(await call("save_creative_content",i)).toEqual(r);
    await expect(call("save_creative_content",{...i,content:{...creative(),product_look:"Different"}})).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REUSED"});
    await call("save_creative_content",{...await input("get_creative_content"),content:creative()});
    expect(await count("creative_concepts")).toBe(2); expect(await count("ai_generations")).toBe(0); expect(await count("creative_assets")).toBe(0);
  });
  it("render de estáticos de UI revalida el contexto del chat antes de llamar al proveedor", async()=>{
    const content=await call("save_creative_content",{...await input("get_creative_content"),content:creative()});if(!content.ok)throw content;
    const {asset}=await startRender(owner.userId,product,content.data.artifact_ids[0],"1:1","higgsfield");
    expect((await checked(db.rpc("pi_content_render_context",{p_kind:"creative",p_asset_id:asset.id}))).data).toMatchObject({base_reference_id:expect.any(String)});
    await call("save_product_context",{product_id:product,schema_version:"1.0",expected_revision:content.revision,idempotency_key:randomUUID(),context:{description:"Información actualizada para la nueva propuesta de este organizador."}});
    expect((await db.rpc("pi_content_render_context",{p_kind:"creative",p_asset_id:asset.id})).error?.message).toBe("PI_REVISION_CONFLICT");
    await processAsset(asset.id,true);
    expect(submit).not.toHaveBeenCalled();
    expect((await checked(db.from("creative_assets").select("render_status").eq("id",asset.id).single())).data).toMatchObject({render_status:"failed"});
  });
  it("galería queda lista para el render existente y conserva slots y hechos para QA",async()=>{
    const r=await call("save_gallery_content",{...await input("get_gallery_content"),content:gallery()}); expect(r).toMatchObject({data:{applied:true,artifact_ids:expect.any(Array)}});
    const shots=(await checked(db.from("page_image_shots").select("slot,payload").eq("product_id",product))).data!;
    expect(shots).toHaveLength(9);expect(shots.filter(s=>s.slot.startsWith("benefit-"))).toHaveLength(3);
    const run=(await checked(db.from("page_image_runs").select("input").eq("product_id",product).single())).data!;
    expect(run.input.verified_facts[0].id).toBe(fact);expect(await count("page_images")).toBe(0);
  });
  it("rechaza cruce de tenant, facts sin verificar, ángulos ajenos y CAS concurrente",async()=>{
    await expect(call("get_creative_content",{product_id:product},other)).rejects.toMatchObject({code:"NOT_FOUND"});
    const i={...await input("get_creative_content"),content:creative()};
    await expect(call("save_creative_content",i,{...owner,scopes:["product_intelligence:read"]})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(call("save_creative_content",{...i,content:{...creative(),fact_ids:[randomUUID()]}})).rejects.toMatchObject({code:"INVALID_REFERENCE"});
    await expect(call("save_creative_content",{...i,content:{...creative(),angle_ids:[randomUUID()]}})).rejects.toMatchObject({code:"INVALID_REFERENCE"});
    const race=await Promise.allSettled([call("save_creative_content",i),call("save_creative_content",{...i,idempotency_key:randomUUID()})]);
    expect(race.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  });
  it("UI y chat comparten contexto y CAS; un cambio de precio independiente no pierde datos base", async()=>{
    const saved = await saveProductData(owner.userId,product,{name:"Organizador nuevo",description:"Organizador para separar útiles sobre la mesa.",source:"merchant",updated_at:new Date().toISOString()},2);
    expect(saved.expected_context_revision).toBe(6);
    await call("save_product_context",{product_id:product,schema_version:"1.0",expected_revision:6,idempotency_key:randomUUID(),pricing:{mode:"recommended",unit_cost_minor:4500}});
    const supplier = await saveBasicContext(owner.userId,product,{supplier_text:"Texto proporcionado por el proveedor"},6);
    expect(supplier.expected_context_revision).toBe(8);
    await expect(saveBasicContext(owner.userId,product,{supplier_text:"Pantalla antigua"},6)).rejects.toMatchObject({code:"REVISION_CONFLICT"});
    const read=await call("get_product_context",{product_id:product});
    expect(read).toMatchObject({data:{product:{context:{display_name:"Organizador nuevo",supplier_text:"Texto proporcionado por el proveedor",last_revision:8}}}});
    expect(await count("ai_generations")).toBe(0);
  });
  it("contexto básico no-op conserva el token de edición aunque existan revisiones de estrategia", async()=>{
    const saved=await saveBasicContext(owner.userId,product,{description:"Organizador con compartimentos."},2);
    expect(saved).toMatchObject({expected_revision:5,expected_context_revision:2});
  });
  it("consejo requiere aprobación exacta y deja de usarse cuando cambia su evidencia",async()=>{
    await call("save_usage_tip",{...await input("get_usage_tip"),content:{text:"Separa tus útiles en los compartimentos del organizador.",basis:"Compartimentos comprobados",fact_ids:[fact]}});
    const repo=createContextRepository(db),args={p_access:contextAccess(owner),p_product_id:product};
    const r=await repo.loadTipReview!(args,signal()) as {usable:boolean;content_etag:string};expect(r.usable).toBe(false);
    await expect(reviewUsageTip(repo,owner,product,"approve","a".repeat(64))).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
    await reviewUsageTip(repo,owner,product,"approve",r.content_etag);expect(await repo.loadTipReview!(args,signal())).toMatchObject({usable:true});
    const context=await call("get_product_context",{product_id:product});if(!context.ok)throw context;
    await call("save_research",{product_id:product,schema_version:"1.0",expected_revision:context.revision,idempotency_key:randomUUID(),facts:[{id:fact,usage_status:"prohibited",reason:"Nueva revisión"}]});
    expect(await repo.loadTipReview!(args,signal())).toMatchObject({usable:false});
  });
  it("evento existente crea propuesta sin aprobar ni publicar, y rechaza evento ajeno al calendario",async()=>{
    const event=(await checked(db.from("events").select("id").eq("status","published").limit(1).single())).data!;
    const content={event_id:event.id,fact_ids:[fact],content:{announcement:"Organiza tu espacio para esta temporada",subtitle:"Dale un lugar a los útiles de tu escritorio y encuentra cada cosa cuando la necesitas.",badge_label:"TEMPORADA"}};
    await expect(call("save_event_content",{...await input("get_event_content"),content:{...content,event_id:randomUUID()}})).rejects.toMatchObject({code:"INVALID_REFERENCE"});
    await call("save_event_content",{...await input("get_event_content"),content});
    expect((await checked(db.from("event_copy").select("status,content,model").eq("product_id",product).single())).data).toMatchObject({status:"generated",content:null,model:"chat"});
  });
  it("métricas vacías son explícitas; no permite aprendizaje concluyente sin datos",async()=>{
    const m=await metrics();expect(m.data).toMatchObject({groups:[],cod:null,attribution:"product_campaigns_only"});
    const learning={strategy_id:strategy,hypothesis:"El orden motiva la compra",criteria:"Comparar compras y costo",observation:"No hay datos",outcome:"supports_hypothesis",limitations:["Sin pedidos cobrados"],next_action:"Recolectar datos"};
    await expect(call("save_product_learning",{product_id:product,schema_version:"1.0",expected_revision:m.revision,from:m.data.from,through:m.data.through,expected_performance_etag:m.data.performance_etag,idempotency_key:randomUUID(),learning})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  });
  it("agrega solo campañas, separa monedas, congela medición y no modifica selección",async()=>{
    const campaign=randomUUID(),ad=randomUUID();
    await checked(db.from("ad_campaigns").insert({id:campaign,user_id:owner.userId,product_id:product,name:"Campaña ficticia",structure:"abo",currency:"CLP",timezone:"America/Santiago",launch:{},engine:{}}));
    await checked(db.from("ad_insights_daily").insert([{unit_id:campaign,campaign_id:campaign,user_id:owner.userId,level:"campaign",date:"2026-10-02",spend:5000,purchases:2,purchase_value:50000,impressions:1000,clicks:20},
      {unit_id:ad,campaign_id:campaign,user_id:owner.userId,level:"ad",date:"2026-10-02",spend:5000,purchases:2,purchase_value:50000,impressions:1000,clicks:20}]));
    const m=await metrics();expect(m.data.groups).toMatchObject([{spend:5000,purchases:2,clicks:20}]);
    const i={product_id:product,schema_version:"1.0",expected_revision:m.revision,from:m.data.from,through:m.data.through,expected_performance_etag:m.data.performance_etag,idempotency_key:randomUUID(),learning:{strategy_id:strategy,hypothesis:"El orden motiva la compra",criteria:"CPA menor al objetivo",observation:"Dos compras reportadas por Meta",outcome:"inconclusive",limitations:["Muestra pequeña; sin entregas cobradas"],next_action:"Seguir midiendo"}};
    expect(await call("save_product_learning",{...i,dry_run:true})).toMatchObject({data:{applied:false,learning_id:null}});
    const saved=await call("save_product_learning",i);if(!saved.ok)throw saved;expect(await call("save_product_learning",i)).toEqual(saved);
    await checked(db.from("ad_insights_daily").update({spend:6000}).eq("unit_id",campaign));
    const r=await call("get_product_learning",{product_id:product});if(!r.ok)throw r;
    expect(r.data.items).toMatchObject([{performance:{groups:[{spend:5000}]}}]);
    await expect(call("save_product_learning",{...i,expected_revision:saved.revision,idempotency_key:randomUUID()})).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
    const selected=await call("get_product_strategy",{product_id:product});expect(selected).toMatchObject({data:{id:strategy}});
    const learningId=saved.data.learning_id;
    const research=await call("save_research",{product_id:product,schema_version:"1.0",expected_revision:saved.revision,idempotency_key:randomUUID(),sources:[{
      client_ref:"measured_learning",title:"Aprendizaje de la campaña",source_type:"internal",retrieved_at:new Date().toISOString(),excerpt:"Dos compras reportadas por Meta; muestra pequeña",author:null,editor:null,url:null,internal_ref:{kind:"product_learning",id:learningId}
    }]});
    expect(research.ok).toBe(true);
    expect((await db.from("pi_product_learnings").update({content:{}}).eq("product_id",product)).error).toBeTruthy();
  });
  it("permisos RPC cerrados y aprendizaje requiere performance:read",async()=>{
    await expect(call("get_product_performance",{product_id:product,from:"2026-10-01",through:"2026-10-06"},{...owner,scopes:["product_intelligence:read"]})).rejects.toMatchObject({code:"FORBIDDEN"});
    const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    expect((await anon.rpc("pi_load_content",{p_access:contextAccess(owner),p_product_id:product,p_kind:"tip"})).error?.code).toBe("42501");
    expect((await anon.rpc("pi_load_performance",{p_access:contextAccess(owner),p_product_id:product,p_from:"2026-10-01",p_through:"2026-10-06"})).error?.code).toBe("42501");
  });
  async function generation() {
    await call("save_gallery_content",{...await input("get_gallery_content"),content:gallery()});
    const r=await call("get_gallery_content",{product_id:product});if(!r.ok)throw r;
    const shots=(r.data.current as {id:string}[]).slice(0,2);
    return {product_id:product,schema_version:"1.0",expected_revision:r.revision,expected_content_etag:r.data.content_etag,shot_ids:shots.map(s=>s.id),provider:"higgsfield",max_estimated_usd:10,idempotency_key:randomUUID()};
  }
  it("preview sin cola, enqueue atómico, replay y estado sin consultar proveedores",async()=>{
    const i=await generation();expect(await call("generate_gallery_images",{...i,dry_run:true})).toMatchObject({data:{status:"preview",image_ids:[],operation_id:null}});
    expect(await count("pi_gallery_operations")).toBe(0);expect(await count("page_images")).toBe(0);
    const r=await call("generate_gallery_images",i);if(!r.ok)throw r;
    expect(r.data.image_ids).toHaveLength(2);expect(await call("generate_gallery_images",i)).toEqual(r);
    const state=await call("get_gallery_generation_status",{product_id:product,operation_id:r.data.operation_id});expect(state).toMatchObject({data:{status:"queued",requires_review:true}});
    expect(submit).not.toHaveBeenCalled();
    await expect(call("get_gallery_generation_status",{product_id:product,operation_id:r.data.operation_id},other)).rejects.toMatchObject({code:"NOT_FOUND"});
    const claim=(await checked(db.rpc("pi_claim_gallery_image",{p_image_id:r.data.image_ids[0]}))).data;
    expect(claim).toMatchObject({error_code:"dispatching",pi_qa_enabled:false,pi_base_reference_id:expect.any(String)});
    expect((await checked(db.rpc("pi_claim_gallery_image",{p_image_id:r.data.image_ids[0]}))).data).toBeNull();
  });
  it("el borrado operacional conserva Storage primero y elimina la cola y sus filas por cascada",async()=>{
    const r=await call("generate_gallery_images",await generation());if(!r.ok)throw r;
    expect(await deleteProducts(owner.userId,[product])).toBe(1);
    for(const table of ["pi_gallery_operations","page_images","page_image_shots","pi_revisions","pi_audit_events","pi_idempotency_records"]) expect(await count(table)).toBe(0);
    expect(submit).not.toHaveBeenCalled();
  });
  it("contexto cambiado cancela todas las imágenes no enviadas antes de gastar",async()=>{
    const i=await generation(),r=await call("generate_gallery_images",i);if(!r.ok)throw r;
    await call("save_product_context",{product_id:product,schema_version:"1.0",expected_revision:i.expected_revision,idempotency_key:randomUUID(),context:{description:"Organizador para útiles, con información actualizada."}});
    expect((await checked(db.rpc("pi_claim_gallery_image",{p_image_id:r.data.image_ids[0]}))).data).toBeNull();
    expect((await checked(db.from("page_images").select("render_status").eq("pi_operation_id",r.data.operation_id))).data!.every(row=>row.render_status==="failed")).toBe(true);
    expect(await call("get_gallery_generation_status",{product_id:product,operation_id:r.data.operation_id})).toMatchObject({data:{status:"cancelled"}});
    expect(submit).not.toHaveBeenCalled();
  });
  it("un envío ambiguo se concilia y nunca se repite automáticamente",async()=>{
    const r=await call("generate_gallery_images",await generation());if(!r.ok)throw r;
    vi.mocked(submit).mockRejectedValue(new HiggsfieldError("network","fixture interrupted"));
    await processImage(r.data.image_ids[0],true);await processImage(r.data.image_ids[0],true);
    await runGalleryOperation(r.data.operation_id!);
    expect((await checked(db.from("page_images").select("error_code").eq("id",r.data.image_ids[1]).single())).data).toMatchObject({error_code:"dispatch_halted"});
    expect(submit).toHaveBeenCalledTimes(1);
    expect(await call("get_gallery_generation_status",{product_id:product,operation_id:r.data.operation_id})).toMatchObject({data:{status:"reconciling"}});
  });

});
