import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({prepare:vi.fn(),connection:vi.fn(),publications:vi.fn(),run:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/pipeline/publish",()=>({preparePublish:mocks.prepare,getPublications:mocks.publications,runPublish:mocks.run,connectionProblem:(c:unknown)=>c?null:"Conecta Shopify"}));
vi.mock("@/lib/integrations/shopify/connection",()=>({getShopifyConnection:mocks.connection}));
vi.mock("@/lib/integrations/admin",()=>({adminClient:()=>({rpc:mocks.rpc})}));
import { createShopifyAutomationExecutor, runAutomaticShopifyPublication } from "./shopify-automation";
import { fingerprint, type PublishInput } from "@/lib/shopify/publish/mapping";
import { PI_SCOPES, type Principal } from "./policy";
import type { ShopifyAutomationRepository } from "./repository";
import { parseToolInput } from "./validation";
const product=randomUUID(),owner=randomUUID(),operation=randomUUID(),strategy=randomUUID(),angle=randomUUID();
const principal:Principal={userId:owner,actorId:owner,actorKind:"merchant",scopes:PI_SCOPES};
const input:PublishInput={listing:{title:"Organizador",short_name:"Organizador",short_description:"Ordena tus útiles",offer_line:"Paga al recibir",seo_title:"Organizador",seo_description:"Ordena tus útiles"},components:[],reviews:[],packs:[],gallery:[],accent:null};
const state={enabled:true,active:true,authorization_id:randomUUID(),strategy_id:strategy,confirmed_hooks:[{angle_id:angle,hook:"Ordena tus útiles"}],dependency_hash:"a".repeat(64),revision:6,next_action:"Continúa"};
const publicationInput=()=>parseToolInput("publish_product",{product_id:product,expected_revision:6,idempotency_key:randomUUID(),expected_fingerprint:fingerprint(input)});
function runner(dry=false){
 const rpc=vi.fn().mockImplementation(async(args:Record<string,unknown>)=>args.p_action==="read"?state:args.p_action==="publish_replay"?null:{applied:!dry,dry_run:dry,operation_id:dry?null:operation,status:dry?"ready":"queued"});
 const repo:ShopifyAutomationRepository={shopifyAutomation:rpc},wake=vi.fn();return{rpc,wake,execute:createShopifyAutomationExecutor(repo,undefined,wake)};
}
beforeEach(()=>{vi.clearAllMocks();mocks.prepare.mockResolvedValue({input,images:[],videos:[],missing:[]});mocks.connection.mockResolvedValue({shop_domain:"fixture.myshopify.com"});mocks.publications.mockResolvedValue(new Map());});
describe("Shopify automático · cola y validación de publicación",()=>{
 it("rechaza antes de leer o escribir si faltan scopes",async()=>{
  const r=runner();await expect(r.execute({...principal,scopes:["product_intelligence:read"]},{tool:"publish_product",input:publicationInput()},AbortSignal.timeout(1000))).rejects.toMatchObject({code:"FORBIDDEN"});expect(r.rpc).not.toHaveBeenCalled();
 });
 it("dry run valida sin despertar un worker; publicar despierta el trabajo durable",async()=>{
  const r=runner(true);expect(await r.execute(principal,{tool:"publish_product",input:{...publicationInput(),dry_run:true}},AbortSignal.timeout(1000))).toMatchObject({data:{dry_run:true,operation_id:null}});expect(r.wake).not.toHaveBeenCalled();
  const live=runner();await live.execute(principal,{tool:"publish_product",input:publicationInput()},AbortSignal.timeout(1000));expect(live.wake).toHaveBeenCalledExactlyOnceWith(operation);
 });
 it("faltantes y fingerprint cambiado impiden encolar",async()=>{
  const r=runner();mocks.prepare.mockResolvedValueOnce({input,images:[],missing:["Falta la portada"]});await expect(r.execute(principal,{tool:"publish_product",input:publicationInput()},AbortSignal.timeout(1000))).rejects.toMatchObject({code:"VALIDATION_ERROR"});
  await expect(r.execute(principal,{tool:"publish_product",input:{...publicationInput(),expected_fingerprint:"b".repeat(32)}},AbortSignal.timeout(1000))).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});expect(r.rpc.mock.calls.some(([a])=>a.p_action==="publish")).toBe(false);expect(r.wake).not.toHaveBeenCalled();
 });
 it("un replay recupera la cola antes de revalidar el contenido que pudo cambiar",async()=>{
  const r=runner();r.rpc.mockResolvedValue({applied:true,dry_run:false,operation_id:operation,status:"queued"});await r.execute(principal,{tool:"publish_product",input:publicationInput()},AbortSignal.timeout(1000));expect(mocks.prepare).not.toHaveBeenCalled();expect(r.wake).toHaveBeenCalledWith(operation);expect(r.rpc).toHaveBeenCalledTimes(1);
 });
 it("un worker revalida autorización, tienda y contenido antes de escribir",async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="pi_claim_shopify_publication"?{product_id:product,user_id:owner,fingerprint:fingerprint(input),shop_domain:"fixture.myshopify.com"}:name==="pi_guard_shopify_publication"?false:null}));
  await runAutomaticShopifyPublication(operation);expect(mocks.run).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenLastCalledWith("pi_finish_shopify_publication",expect.objectContaining({p_error:expect.any(String)}));
 });
 it("no publica la versión que cambió después de encolarse",async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="pi_claim_shopify_publication"?{product_id:product,user_id:owner,fingerprint:"b".repeat(32),shop_domain:"fixture.myshopify.com"}:true}));
  await runAutomaticShopifyPublication(operation);expect(mocks.run).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenLastCalledWith("pi_finish_shopify_publication",expect.objectContaining({p_error:expect.stringContaining("página cambió")}));
 });
 it("termina solo después de que el writer confirmó publicación; vuelve a comprobar antes de cada escritura",async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="pi_claim_shopify_publication"?{product_id:product,user_id:owner,fingerprint:fingerprint(input),shop_domain:"fixture.myshopify.com"}:true}));
  mocks.publications.mockResolvedValue(new Map([[product,{status:"published"}]]));mocks.run.mockImplementationOnce(async(_u:string,_p:string,options:{beforeWrite:()=>Promise<void>})=>options.beforeWrite());
  await runAutomaticShopifyPublication(operation);expect(mocks.run).toHaveBeenCalledOnce();expect(mocks.rpc.mock.calls.filter(([name])=>name==="pi_guard_shopify_publication")).toHaveLength(2);expect(mocks.rpc).toHaveBeenLastCalledWith("pi_finish_shopify_publication",expect.objectContaining({p_error:null}));
 });
});
