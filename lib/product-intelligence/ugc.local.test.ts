/** Opt-in, URL local exacta; todos los datos son ficticios, sin render ni publicación de pago. */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createContextRepository, contextAccess } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { requestFixture } from "./test-fixtures";
import { ugcInputFixture } from "./ugc-fixtures";
import { reviewUgc } from "./ugc-service";
import { expireStaleVideos } from "@/lib/video/store";
import { deleteProducts } from "@/lib/products/delete";
import { processShot } from "@/lib/pipeline/video";
import { HiggsfieldError, submit } from "@/lib/integrations/higgsfield/client";
import type { ToolName } from "./schemas";
vi.mock("@/lib/integrations/higgsfield/connection", () => ({ higgsfieldKey: vi.fn(async () => "local-test-never-submitted"), markHiggsfieldInvalid: vi.fn() }));
vi.mock("@/lib/integrations/higgsfield/client", async (actual) => ({ ...await actual<typeof import("@/lib/integrations/higgsfield/client")>(), submit: vi.fn() }));
const local = process.env.PI_LOCAL_TEST === "1" ? describe : describe.skip;
local("UGC · persistencia y cola local", () => {
  let db: SupabaseClient, owner: Principal, other: Principal, product: string, strategy: string, angle: string;
  let execute: ReturnType<typeof createProductIntelligenceExecutor>;
  const users: string[] = [];
  const signal = () => AbortSignal.timeout(10_000);
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>): Promise<T> { const r=await op; if(r.error) throw r.error; return r; }
  async function user() {
    const r = await checked(db.auth.admin.createUser({ email: `ugc-${randomBytes(8).toString("hex")}@example.test`, password: randomBytes(32).toString("base64url"), email_confirm: true }));
    const id=r.data.user!.id;users.push(id);
    await checked(db.from("merchant_settings").insert({ user_id:id,country_code:"CL",currency:"CLP",language:"es",timezone:"America/Santiago",market_confirmed_at:new Date().toISOString() }));
    return { userId:id,actorId:id,actorKind:"merchant",scopes:PI_SCOPES } as Principal;
  }
  async function call<K extends ToolName>(tool: K, input: unknown, principal=owner) { return parseToolOutput(tool,await execute(principal,{tool,input:parseToolInput(tool,input)} as Parameters<typeof execute>[1],signal())); }
  async function read() { const r=await call("get_ugc_content",{product_id:product,include_contract:false});if(!r.ok)throw r.error;return r; }
  async function count(table: string) { return (await checked(db.from(table).select("*",{count:"exact",head:true}).eq("product_id",product))).count; }
  async function input() { const r=await read();return {...ugcInputFixture(product,strategy,angle),expected_revision:r.revision,expected_ugc_etag:r.data.ugc_etag}; }
  async function saved() { const r=await call("save_ugc_content",await input());if(!r.ok||!r.data.script_id)throw r;return r; }
  async function approve(id: string) {
    const r=await read(),s=r.data.scripts.find((s)=>s.id===id)!;
    await reviewUgc(createContextRepository(db),owner,product,id,"approve",s.artifact_etag as string);
  }
  async function renderInput(id:string,stage="keyframes",keys=["K1"]) {
    const r=await read(),s=r.data.scripts.find((s)=>s.id===id)!;
    return {product_id:product,schema_version:"1.0",expected_revision:r.revision,script_id:id,expected_artifact_etag:s.artifact_etag,stage,shot_keys:keys,idempotency_key:randomUUID()};
  }
  beforeAll(async()=>{
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    execute=createProductIntelligenceExecutor(createContextRepository(db));owner=await user();other=await user();
  });
  beforeEach(async()=>{
    vi.mocked(submit).mockReset();
    product=randomUUID();const image=randomUUID();
    await checked(db.from("products").insert({id:product,user_id:owner.userId,shopify_product_id:product,title:"Organizador",currency:"CLP"}));
    await checked(db.from("product_reference_images").insert({id:image,product_id:product,user_id:owner.userId,source:"shopify",url:"https://cdn.shopify.com/local-fixture.webp",is_cover:true}));
    const env=(revision:number)=>({product_id:product,schema_version:"1.0",expected_revision:revision,idempotency_key:randomUUID()});
    const research=await call("save_research",{...requestFixture("propose-research").payload as object,...env(0)});if(!research.ok)throw research;
    const fact=research.data.id_map.compartments_fact;
    await call("save_product_context",{...env(1),context:{display_name:"Organizador",description:"Organizador con compartimentos.",base_reference_image_id:image},pricing:{mode:"recommended",unit_cost_minor:4000}});
    const analysis=JSON.parse(JSON.stringify(requestFixture("analysis-four-personas").payload).replaceAll("00000000-0000-0000-0000-00000000000b",fact));
    const result=await call("save_product_analysis",{...analysis,...env(2)});if(!result.ok)throw result;const map=result.data.id_map;
    await call("save_research",{...env(3),facts:[{id:fact,verification_status:"verified",usage_status:"approved",reason:"Verificado en la fuente ficticia."}]});
    const selected=await call("set_product_strategy",{...env(4),based_on_revision:4,action:"select",primary_persona_id:map.persona_1,primary_jtbd_id:map.job_1,primary_pain_id:map.pain_1,primary_angle_id:map.angle_1_1,secondary_angle_ids:[],offer_id:map.offer_main,positioning:"Orden cotidiano",rationale:"Hipótesis para probar."});
    if(!selected.ok||!selected.data.strategy)throw selected;
    strategy=selected.data.strategy.id;angle=map.angle_1_1;
  });
  afterAll(async()=>{for(const id of users)await checked(db.auth.admin.deleteUser(id));},20000);
  it("propuesta del chat sin llamadas, con historia y revisión; dry_run no escribe",async()=>{
    const i=await input(),before=await count("video_scripts");
    expect(await call("save_ugc_content",{...i,dry_run:true})).toMatchObject({data:{applied:false,script_id:null,dry_run:true}});
    expect(await count("video_scripts")).toBe(before);
    const r=await call("save_ugc_content",i);expect(r).toMatchObject({revision:6,data:{status:"in_review",applied:true}});
    const row=(await checked(db.from("video_scripts").select("*").eq("id",r.ok?r.data.script_id:"").single())).data!;
    expect(row).toMatchObject({source:"mcp_chat",model:"chat",approved_at:null,provenance:{strategy_id:strategy,angle_id:angle,landing_hook_id:"lost-pencil"}});
    expect(await count("ai_generations")).toBe(0);expect(await count("pi_ugc_operations")).toBe(0);
  });
  it("receipt antes de CAS, clave distinta con cambio rechaza y reemplazo conserva versión",async()=>{
    const i=await input(),r=await call("save_ugc_content",i);expect(await call("save_ugc_content",i)).toEqual(r);
    await expect(call("save_ugc_content",{...i,landing_hook_id:"other"})).rejects.toMatchObject({code:"IDEMPOTENCY_KEY_REUSED"});
    await saved();expect(await count("video_scripts")).toBe(2);expect((await read()).data.scripts).toHaveLength(1);
  });
  it("CAS concurrente da una propuesta y una revisión, misma clave un resultado",async()=>{
    const i=await input(),results=await Promise.allSettled([call("save_ugc_content",i),call("save_ugc_content",{...i,idempotency_key:randomUUID()})]);
    expect(results.filter((r)=>r.status==="fulfilled")).toHaveLength(1);expect(await count("video_scripts")).toBe(1);
    const again=await input(),replay=await Promise.all([call("save_ugc_content",again),call("save_ugc_content",again)]);expect(replay[0]).toEqual(replay[1]);
  });
  it("aislamiento, permisos y RPC cerradas; no aprueba sin etag",async()=>{
    const r=await saved();await expect(call("get_ugc_content",{product_id:product},other)).rejects.toMatchObject({code:"NOT_FOUND"});
    await expect(call("save_ugc_content",await input(),{...owner,scopes:["product_intelligence:read"]})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(reviewUgc(createContextRepository(db),owner,product,r.data.script_id!,"approve",undefined)).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
    const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    expect((await anon.rpc("pi_load_ugc",{p_access:contextAccess(owner),p_product_id:product})).error?.code).toBe("42501");
  });
  it("no genera sin revisión; dry_run calcula y no crea operation, shot o receipt",async()=>{
    const r=await saved(),id=r.data.script_id!;
    await expect(call("generate_ugc",await renderInput(id))).rejects.toMatchObject({code:"EXECUTION_NOT_READY"});await approve(id);
    const countBefore=await count("pi_idempotency_records");
    expect(await call("generate_ugc",{...await renderInput(id),dry_run:true})).toMatchObject({data:{dry_run:true,max_output_items:1,will_call_providers:["higgsfield"]}});
    expect(await count("pi_ugc_operations")).toBe(0);expect(await count("video_shots")).toBe(0);expect(await count("pi_idempotency_records")).toBe(countBefore);
  });
  it("colas atómicas e idempotentes, estado puro y doble claim no vuelve a enviar",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);const i=await renderInput(id),op=await call("generate_ugc",i);
    expect(op).toMatchObject({data:{status:"queued",stage:"keyframes",outputs:[{kind:"video_shot"}]}});expect(await call("generate_ugc",i)).toEqual({...op,request_id:expect.any(String)});
    expect(await count("video_shots")).toBe(1);expect(await count("pi_ugc_operations")).toBe(1);
    if(!op.ok||"dry_run" in op.data)throw op;const operation=op.data.operation_id;
    const shot=(await checked(db.from("video_shots").select("id").eq("operation_id",operation).single())).data!.id;
    const first=await checked(db.rpc("pi_claim_ugc_shot",{p_shot_id:shot}));expect(first.data).toMatchObject({error_code:"dispatching"});
    expect((await checked(db.rpc("pi_claim_ugc_shot",{p_shot_id:shot}))).data).toBeNull();
    const read=await call("get_generation_status",{product_id:product,operation_id:operation});expect(read).toMatchObject({data:{status:"running"}});expect(await count("ai_generations")).toBe(0);
  });
  it("contexto o archivo modificado cancela antes de un submit; edición bloqueada en cola",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);const op=await call("generate_ugc",await renderInput(id));if(!op.ok||"dry_run" in op.data)throw op;
    await expect(reviewUgc(createContextRepository(db),owner,product,id,"unapprove",(await read()).data.scripts[0].artifact_etag as string)).rejects.toMatchObject({code:"GENERATION_IN_PROGRESS"});
    const shot=(await checked(db.from("video_shots").select("id").eq("operation_id",op.data.operation_id).single())).data!.id;
    await checked(db.from("product_reference_images").update({url:"https://cdn.shopify.com/changed.webp"}).eq("product_id",product));
    expect((await checked(db.rpc("pi_claim_ugc_shot",{p_shot_id:shot}))).data).toBeNull();
    expect((await checked(db.from("pi_ugc_operations").select("status").eq("id",op.data.operation_id).single())).data!.status).toBe("cancelled");
  });
  it("clips requieren imágenes aprobadas",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);
    await expect(call("generate_ugc",{...await renderInput(id,"clips",["A1"]),dry_run:true})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  });
  async function rendered() {
    const r=await saved(),id=r.data.script_id!; await approve(id);
    const row=(await checked(db.from("video_scripts").select("*").eq("id",id).single())).data!;
    for (const [kind,list] of [["keyframe",row.payload.keyframes],["a_roll",row.payload.a_roll],["b_roll",row.payload.b_roll]] as const) {
      await checked(db.from("video_shots").insert(list.map((k: {key:string})=>({script_id:id,product_id:product,user_id:owner.userId,key:k.key,kind,endpoint:"local-fixture",input:{},render_status:"succeeded",status:kind==="keyframe"?"approved":"in_review",storage_path:`${owner.userId}/${product}/${k.key}.fixture`}))));
    }
    return row;
  }
  async function finalClaim(id:string,etag:string,action="upload") { return db.rpc("pi_claim_ugc_final",{p_access:{...contextAccess(owner),final_action:action},p_product_id:product,p_script_id:id,p_etag:etag}); }
  it("worker concurrente solo envía una vez; timeout ambiguo no se reenvía",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);const op=await call("generate_ugc",await renderInput(id));if(!op.ok||"dry_run" in op.data)throw op;
    const shot=(await checked(db.from("video_shots").select("id").eq("operation_id",op.data.operation_id).single())).data!.id;
    vi.mocked(submit).mockRejectedValue(new HiggsfieldError("network","Timeout ficticio"));
    await Promise.all([processShot(shot,true),processShot(shot,true)]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect((await checked(db.from("video_shots").select("error_code,render_status").eq("id",shot).single())).data).toMatchObject({error_code:"dispatch_unknown",render_status:"failed"});
    await processShot(shot,true);expect(submit).toHaveBeenCalledTimes(1);
    expect(await call("get_generation_status",{product_id:product,operation_id:op.data.operation_id})).toMatchObject({data:{status:"reconciling"}});
    await expect(call("generate_ugc",{...await renderInput(id),replace_existing:true})).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
    const current=(await read()).data.scripts.find((s)=>s.id===id)!;
    const failed=(await checked(db.from("video_shots").select("updated_at").eq("id",shot).single())).data!;
    const resolve={p_access:contextAccess(owner),p_product_id:product,p_shot_id:shot,p_etag:current.artifact_etag,p_shot_updated_at:failed.updated_at,p_request_id:null,p_confirm_not_sent:true};
    await checked(db.rpc("pi_reconcile_ugc_shot",resolve));
    expect((await db.rpc("pi_reconcile_ugc_shot",resolve)).error?.message).toBe("PI_ARTIFACT_CONFLICT");
    expect(submit).toHaveBeenCalledTimes(1);
    const retry=await call("generate_ugc",await renderInput(id));expect(retry).toMatchObject({data:{status:"queued"}});
  });
  it("montaje con lease, CAS y referencias aprobadas; retirar una imagen invalida clips y final",async()=>{
    const s=await rendered(),id=s.id;
    const claimed=(await checked(finalClaim(id,s.artifact_etag))).data;
    expect((await finalClaim(id,s.artifact_etag)).error?.message).toBe("PI_GENERATION_IN_PROGRESS");
    const complete=(patch:object,token=claimed.final_operation_id)=>db.rpc("pi_complete_ugc_final",{p_access:contextAccess(owner),p_product_id:product,p_script_id:id,p_token:token,p_patch:patch});
    expect((await complete({},randomUUID())).error?.message).toBe("PI_ARTIFACT_CONFLICT");
    await checked(complete({final_storage_path:`${owner.userId}/${product}/final.fixture`,final_status:"in_review"}));
    const uploaded=(await checked(db.from("video_scripts").select("*").eq("id",id).single())).data!;
    const ready=(await checked(finalClaim(id,uploaded.artifact_etag,"approve"))).data;
    await checked(db.rpc("pi_complete_ugc_final",{p_access:contextAccess(owner),p_product_id:product,p_script_id:id,p_token:ready.final_operation_id,p_patch:{final_status:"approved"}}));
    await checked(db.rpc("pi_assert_ugc_publishable",{p_access:contextAccess(owner),p_product_id:product,p_script_ids:[id]}));
    expect((await db.rpc("pi_assert_ugc_publishable",{p_access:contextAccess(other),p_product_id:product,p_script_ids:[id]})).error?.message).toBe("PI_NOT_FOUND");
    expect((await db.from("page_components").insert({user_id:owner.userId,product_id:product,component:"ugc-slider",position:1,proposal:{script_ids:[randomUUID()]},content:null,enabled:true})).error?.message).toBe("PI_INVALID_REFERENCE");
    const current=(await checked(db.from("video_scripts").select("*").eq("id",id).single())).data!;
    const shot=(await checked(db.from("video_shots").select("*").eq("script_id",id).eq("key","K2").single())).data!;
    const args={p_access:contextAccess(owner),p_product_id:product,p_script_id:id,p_etag:current.artifact_etag,p_action:"reopen",p_shot_id:shot.id,p_shot_updated_at:shot.updated_at};
    await checked(db.rpc("pi_review_ugc_keyframes",args));
    expect((await db.rpc("pi_review_ugc_keyframes",args)).error?.message).toBe("PI_ARTIFACT_CONFLICT");
    expect((await checked(db.from("video_scripts").select("final_status").eq("id",id).single())).data!.final_status).toBe("in_review");
    expect((await checked(db.from("video_shots").select("id").eq("script_id",id).neq("kind","keyframe").is("superseded_at",null))).data).toHaveLength(0);
    expect((await db.rpc("pi_assert_ugc_publishable",{p_access:contextAccess(owner),p_product_id:product,p_script_ids:[id]})).error?.message).toBe("PI_INVALID_REFERENCE");
  });
  it("montaje incompleto y contexto obsoleto no se aprueban; paginación conserva selección",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);
    expect((await finalClaim(id,(await read()).data.scripts[0].artifact_etag as string)).error?.message).toBe("PI_VALIDATION_ERROR");
    const next=await input();await call("save_ugc_content",{...next,execution_key:"desk-hook-b",landing_hook_id:"other"});
    const page=await call("get_ugc_content",{product_id:product,page_size:1});if(!page.ok)throw page;
    expect(page.data.truncated).toBe(true);expect(page.data.scripts[0]).not.toHaveProperty("payload");
    const page2=await call("get_ugc_content",{product_id:product,page_size:1,cursor:page.data.next_cursor});if(!page2.ok)throw page2;
    expect(page2.data.scripts[0].id).not.toBe(page.data.scripts[0].id);
    await saved();await expect(call("get_ugc_content",{product_id:product,page_size:1,cursor:page.data.next_cursor})).rejects.toMatchObject({code:"CURSOR_EXPIRED"});
  });

  it("contexto cambiado bloquea montaje y publicación; operación histórica conserva estado",async()=>{
    const s=await rendered();
    await checked(db.from("product_reference_images").update({url:"https://cdn.shopify.com/changed-fixture.webp"}).eq("product_id",product));
    expect((await finalClaim(s.id,s.artifact_etag)).error?.message).toBe("PI_REVISION_CONFLICT");
    await expect(call("get_ugc_montage",{product_id:product,script_id:s.id,expected_artifact_etag:s.artifact_etag})).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
  });
  it("cascadas, relaciones compuestas e historia de una ejecución reemplazada",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);
    const i=await renderInput(id),op=await call("generate_ugc",i);if(!op.ok||"dry_run" in op.data)throw op;
    const shot=(await checked(db.from("video_shots").select("*").eq("operation_id",op.data.operation_id).single())).data!;
    const forged=await db.from("video_shots").insert({script_id:id,product_id:product,user_id:other.userId,key:"K2",kind:"keyframe",endpoint:"local",input:{},operation_id:op.data.operation_id});
    expect(forged.error?.code).toBe("23503");
    await checked(db.from("video_shots").update({render_status:"failed",error_code:"bad_request"}).eq("id",shot.id));
    await saved();
    expect(await call("get_generation_status",{product_id:product,operation_id:op.data.operation_id})).toMatchObject({data:{status:"cancelled",context_stale:true}});
    expect(await call("generate_ugc",i)).toMatchObject({data:{operation_id:op.data.operation_id,status:"cancelled"}});
    // El fixture no tiene archivos: la cascada de la FK se comprueba sin simular limpieza de Storage.
    expect(await deleteProducts(owner.userId,[product])).toBe(1);
    expect(await count("pi_ugc_operations")).toBe(0);expect(await count("video_scripts")).toBe(0);expect(await count("video_shots")).toBe(0);
  });

  it("borra anuncios y guiones que referencian los medios antes de la cascada del producto",async()=>{
    const script=(await saved()).data.script_id!;
    const media=randomUUID(),campaign=randomUUID(),adset=randomUUID();
    await checked(db.from("ad_media").insert({id:media,user_id:owner.userId,product_id:product,kind:"video",name:"Fixture",storage_path:`${owner.userId}/${product}/fixture.mp4`,mime_type:"video/mp4",size_bytes:1}));
    await checked(db.from("video_scripts").update({ad_media_id:media}).eq("id",script));
    await checked(db.from("ad_campaigns").insert({id:campaign,user_id:owner.userId,product_id:product,name:"Fixture",structure:"abo",launch:{},engine:{},currency:"CLP"}));
    await checked(db.from("ad_sets").insert({id:adset,user_id:owner.userId,campaign_id:campaign,name:"Fixture",position:0,audience:{}}));
    await checked(db.from("ads").insert({user_id:owner.userId,campaign_id:campaign,adset_id:adset,name:"Fixture",media_id:media,copy:{}}));
    expect(await deleteProducts(owner.userId,[product])).toBe(1);
    expect(await count("ad_campaigns")).toBe(0);expect(await count("ad_media")).toBe(0);expect(await count("video_scripts")).toBe(0);
    expect((await checked(db.from("ads").select("id").eq("campaign_id",campaign))).data).toEqual([]);
    expect((await checked(db.from("ad_sets").select("id").eq("campaign_id",campaign))).data).toEqual([]);
  });

  it("expirar no libera un submit ambiguo; con request_id exige recuperar sin volver a cobrar",async()=>{
    const r=await saved(),id=r.data.script_id!;await approve(id);
    const op=await call("generate_ugc",await renderInput(id));if(!op.ok||"dry_run" in op.data)throw op;
    const shot=(await checked(db.from("video_shots").select("id").eq("operation_id",op.data.operation_id).single())).data!.id;
    await checked(db.rpc("pi_claim_ugc_shot",{p_shot_id:shot}));
    const old=new Date(Date.now()-50*60*1000).toISOString();
    await checked(db.from("video_shots").update({updated_at:old,created_at:old}).eq("id",shot));
    await expireStaleVideos(owner.userId);
    expect((await checked(db.from("video_shots").select("error_code").eq("id",shot).single())).data!.error_code).toBe("dispatch_unknown");
    await expect(call("generate_ugc",{...await renderInput(id),replace_existing:true})).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
    await checked(db.from("video_shots").update({render_status:"running",error_code:null,hf_request_id:randomUUID(),submitted_at:old}).eq("id",shot));
    await expireStaleVideos(owner.userId);
    await expect(call("generate_ugc",{...await renderInput(id),replace_existing:true})).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
    expect(submit).not.toHaveBeenCalled();
  });

});
