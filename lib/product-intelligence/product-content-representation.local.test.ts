import {afterAll,beforeAll,describe,expect,it} from "vitest";
import sharp from "sharp";
import {randomUUID} from "node:crypto";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {createProductIntelligenceExecutor} from "./knowledge-service";
import {createContextRepository,contextAccess} from "./repository";
import {PI_SCOPES,type Principal} from "./policy";
import {parseToolInput} from "./validation";
import type {ToolCommand} from "./mcp";
import {updateComponent} from "@/lib/pipeline/copy";
import {getVisualWorkbench} from "@/lib/data/visual-production";
import {setProductImageSelection} from "./product-image-selection";
import {preparePublish} from "@/lib/pipeline/publish";
import {CATALOG} from "@/lib/shopify/components/catalog";
const listing={title:"Organizador para tu escritorio",short_name:"Organizador",short_description:"Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",offer_line:"Organiza tu escritorio · Paga al recibir",seo_title:"Organizador para escritorio",seo_description:"Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa."};
describe.runIf(process.env.PI_LOCAL_TEST==="1")("Representación persistida · solo Supabase local",()=>{
 let db:SupabaseClient,owner:Principal,other:Principal,execute:ReturnType<typeof createProductIntelligenceExecutor>;
 const product=randomUUID(),users:string[]=[];
 async function checked<T extends {error:unknown}>(op:PromiseLike<T>){const result=await op;if(result.error)throw new Error(JSON.stringify(result.error));return result;}
 async function merchant(){const created=await checked(db.auth.admin.createUser({email:`content-${randomUUID()}@example.test`,password:randomUUID(),email_confirm:true}));const userId=created.data.user!.id;users.push(userId);await checked(db.from("merchant_settings").insert({user_id:userId,country_code:"CL",currency:"CLP",language:"es",timezone:"America/Santiago",market_confirmed_at:new Date().toISOString(),free_shipping:false,handling_days:1,transit_days_min:2,transit_days_max:3,cutoff_hour:13}));return {userId,actorId:userId,actorKind:"merchant" as const,scopes:PI_SCOPES};}
 async function landing(content=listing){const raw=await createContextRepository(db).loadLanding({p_access:contextAccess(owner),p_product_id:product},AbortSignal.timeout(10000)) as {revision:number;landing_etag:string;stamp:string};return execute(owner,{tool:"save_landing_content",input:parseToolInput("save_landing_content",{product_id:product,schema_version:"1.1",expected_revision:raw.revision,expected_landing_etag:raw.landing_etag,idempotency_key:randomUUID(),entries:[{component:"listing",content},{component:"pain-block",content:CATALOG.find(c=>c.id==="pain-block")!.examples[0]}]})} as ToolCommand,AbortSignal.timeout(10000));}
 async function row(component:string){return (await checked(db.from("page_components").select("*").eq("product_id",product).eq("component",component).is("superseded_at",null).single())).data!;}
 beforeAll(async()=>{
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
  owner=await merchant();other=await merchant();execute=createProductIntelligenceExecutor(createContextRepository(db));
  await checked(db.from("products").insert({id:product,user_id:owner.userId,title:"Catálogo importado",shopify_product_id:product,currency:"CLP"}));
  await execute(owner,{tool:"save_product_context",input:parseToolInput("save_product_context",{product_id:product,schema_version:"1.0",expected_revision:0,idempotency_key:randomUUID(),context:{display_name:"Organizador",description:"Producto para organizar útiles."},pricing:{mode:"recommended",unit_cost_minor:4000}})} as ToolCommand,AbortSignal.timeout(10000));
 },20000);
 afterAll(async()=>{const files=(await db.storage.from("page-media").list(`${owner.userId}/${product}`)).data??[];if(files.length)await checked(db.storage.from("page-media").remove(files.map(f=>`${owner.userId}/${product}/${f.name}`)));for(const id of users)await checked(db.auth.admin.deleteUser(id));},20000);
 it("guarda contenido aprobado, deja lo oculto oculto y actualiza el mismo texto vigente al guardar desde MCP",async()=>{
  await landing();let current=await row("pain-block");
  await updateComponent(owner.userId,product,"pain-block",{expected_id:current.id,expected_updated_at:current.updated_at,enabled:false});
  const currentListing=await row("listing"),manual={...listing,title:"Organizador editado por el comerciante"};
  await updateComponent(owner.userId,product,"listing",{expected_id:currentListing.id,expected_updated_at:currentListing.updated_at,content:manual});
  await landing({...listing,title:"Nueva propuesta guardada en el chat"});
  current=await row("pain-block");expect(current).toMatchObject({enabled:false,status:"approved"});
  expect(await row("listing")).toMatchObject({content:{...listing,title:"Nueva propuesta guardada en el chat"},proposal:{title:"Nueva propuesta guardada en el chat"},status:"approved"});
  const prepared=await preparePublish(owner.userId,product);expect(prepared.input.listing.title).toBe("Nueva propuesta guardada en el chat");expect(prepared.input.components).toEqual([]);expect(prepared.missing).toEqual([expect.stringContaining("portada")]);
 });
 it("no recupera un descarte al guardar desde MCP, y solo una acción explícita lo habilita",async()=>{
  let current=await row("pain-block");await checked(db.from("page_components").update({status:"rejected",enabled:false}).eq("id",current.id));await landing();current=await row("pain-block");expect(current).toMatchObject({status:"rejected",enabled:false});
  await updateComponent(owner.userId,product,"pain-block",{expected_id:current.id,expected_updated_at:current.updated_at,enabled:true});expect(await row("pain-block")).toMatchObject({status:"approved",enabled:true});
 });
 it("rechaza una edición obsoleta y un producto de otro comerciante",async()=>{
  const current=await row("pain-block");await updateComponent(owner.userId,product,"pain-block",{expected_id:current.id,expected_updated_at:current.updated_at,enabled:false});
  await expect(updateComponent(owner.userId,product,"pain-block",{expected_id:current.id,expected_updated_at:current.updated_at,enabled:true})).rejects.toMatchObject({status:409});
  await expect(updateComponent(other.userId,product,"pain-block",{expected_id:current.id,expected_updated_at:current.updated_at,enabled:true})).rejects.toMatchObject({status:409});
 });
 it("elige y ordena imágenes en una transacción; una portada basta; un snapshot viejo no sobrescribe",async()=>{
  const ids=[randomUUID(),randomUUID(),randomUUID()];await checked(db.from("page_images").insert(ids.map(id=>({id,product_id:product,user_id:owner.userId,slot:"gallery",source:"upload",render_status:"succeeded",storage_path:`${owner.userId}/${product}/${id}.webp`,width:600,height:600,size_bytes:100}))));
  for(const id of ids)await checked(db.storage.from("page-media").upload(`${owner.userId}/${product}/${id}.webp`,await sharp({create:{width:600,height:600,channels:3,background:"white"}}).webp().toBuffer(),{contentType:"image/webp"}));
  const visual=(await getVisualWorkbench(owner.userId,product))!;
  const input={expected_revision:visual.revision,expected_etag:visual.etag,expected_dependency_stamp:`gallery:${visual.gallery_etag}`,idempotency_key:randomUUID(),cover:ids[0],gallery:[ids[2],ids[1]]};
  await setProductImageSelection(owner.userId,product,input);await setProductImageSelection(owner.userId,product,input);
  const prepared=await preparePublish(owner.userId,product);expect(prepared.missing).toEqual([]);expect(prepared.input.gallery.map(g=>g.key)).toEqual([ids[0],ids[2],ids[1]].map(id=>`page-media/${owner.userId}/${product}/${id}.webp`));
  await expect(setProductImageSelection(owner.userId,product,{...input,idempotency_key:randomUUID(),gallery:[ids[1],ids[2]]})).rejects.toMatchObject({code:"ARTIFACT_CONFLICT"});
  const fresh=(await getVisualWorkbench(owner.userId,product))!;
  await execute(owner,{tool:"save_product_context",input:parseToolInput("save_product_context",{product_id:product,schema_version:"1.0",context:{description:"Contexto modificado después de abrir la galería."}})} as ToolCommand,AbortSignal.timeout(10000));
  await setProductImageSelection(owner.userId,product,{expected_revision:fresh.revision,expected_etag:fresh.etag,expected_dependency_stamp:`gallery:${fresh.gallery_etag}`,idempotency_key:randomUUID(),cover:ids[0],gallery:[]});
  expect((await preparePublish(owner.userId,product)).missing).toEqual([]);
 });
 it("serializa publicaciones concurrentes y conserva la publicación previa",async()=>{
  const access=contextAccess(owner);
  const publishedAt="2026-10-01T12:00:00+00:00",previous={components:1,content:{images:"previous-image-hash"}};
  await checked(db.from("product_publications").upsert({product_id:product,user_id:owner.userId,shop_domain:"fixture.myshopify.com",status:"published",fingerprint:"previous-content",summary:previous,product_url:"https://fixture.myshopify.com/products/organizador",published_at:publishedAt}));
  const outcomes=await Promise.all([1,2].map(()=>db.rpc("pi_claim_product_publication",{p_access:access,p_product_id:product,p_shop:"fixture.myshopify.com"})));
  expect(outcomes.filter(r=>!r.error)).toHaveLength(1);expect(outcomes.find(r=>r.error)?.error?.message).toBe("PI_GENERATION_IN_PROGRESS");
  const publication=(await checked(db.from("product_publications").select("*").eq("product_id",product).single())).data!;
  expect(publication).toMatchObject({status:"publishing",fingerprint:"previous-content",summary:previous,product_url:"https://fixture.myshopify.com/products/organizador",published_at:publishedAt});
  expect((await db.rpc("pi_claim_product_publication",{p_access:contextAccess(other),p_product_id:product,p_shop:"fixture.myshopify.com"})).error?.message).toBe("PI_NOT_FOUND");
 });
});
