import { describe, expect, it } from "vitest";
import { effectivePage, effectiveVariant, pageSelections } from "./effective-page";
import { publicationChanges, publicationSnapshot } from "./publication-snapshot";
import { fingerprint, type PublishInput } from "@/lib/shopify/publish/mapping";
import type { ExperienceManifest } from "@/lib/product-intelligence/experience-resolver";
const uuid="11111111-1111-4111-8111-111111111111";
const listing={title:"Página principal",short_name:"Producto",short_description:"Descripción",offer_line:"Oferta",seo_title:"Producto",seo_description:"Producto"};
const variants=[{key:"default",angle_id:null,hook_id:null,content:listing},{key:"desk",angle_id:"desk",hook_id:null,content:{...listing,title:"Texto por ángulo"}},{key:"video",angle_id:"desk",hook_id:"video",content:{...listing,title:"Texto del anuncio"}}];
function input():PublishInput{return {listing,listingVariants:variants,accent:null,reviews:[],packs:[],gallery:[{key:"cover",alt:"Producto"}],components:[{id:"pain-block",content:variants.map(v=>({...v,content:{headline:v.content.title}})),images:{image:["original"]},variantImages:[{key:"video",images:{image:["chosen-for-video"]}}]},{id:"faq-and-text",content:{headline:"Preguntas"},images:{}},{id:"use-cases",content:{state:"empty"},images:{}}],disabledConversionComponents:[]};}
const section=(component:string,key="default")=>({section_key:component,component,content_variant_key:key,persuasion_job:"recognition",placement:component==="listing"?"hero" as const:"body" as const});
function experience(key:string,hook:string|null,isDefault=false){return {id:uuid,product_id:uuid,strategy_id:uuid,angle_id:uuid,persuasion_plan_id:uuid,revision:1,plan_revision:1,landing_angle_id:"desk",landing_hook_id:hook,experience_key:key,architecture_variant:"compact",is_default:isDefault,sections:[section("listing",hook?"video":"desk"),section("faq-and-text"),section("pain-block",hook?"video":"desk")]};}
describe("Una página efectiva para ficha, editor y Shopify",()=>{
 it("resuelve hook exacto, ángulo y principal; imágenes y orden salen de esa variante",()=>{
  const page=input();page.experienceManifest={schema_version:"1.0",enabled:true,experiences:[experience("main",null,true),experience("ad","video")]} satisfies ExperienceManifest;
  const resolved=effectivePage(page,{angle_id:"desk",hook_id:"video"});
  expect(resolved.listing.title).toBe("Texto del anuncio");expect(resolved.components.map(c=>c.id)).toEqual(["faq-and-text","pain-block"]);expect(resolved.components[1].images.image).toEqual(["chosen-for-video"]);
  expect(effectivePage(page,{angle_id:"desk",hook_id:"unknown"}).listing.title).toBe("Texto por ángulo");expect(effectivePage(page).listing.title).toBe("Texto por ángulo");
  expect(effectiveVariant(page,"listing",variants).key).toBe("desk");
 });
 it("no recupera ocultos, vacíos ni secciones omitidas",()=>{
  const page=input();page.disabledConversionComponents=["pain-block"];page.experienceManifest={schema_version:"1.0",enabled:true,experiences:[{...experience("main",null,true),sections:[section("listing","desk")]}]};expect(effectivePage(page).components).toEqual([]);
  delete page.experienceManifest;expect(effectivePage(page).components.map(c=>c.id)).toEqual(["faq-and-text"]);
 });
 it("conserva páginas anteriores con contenido nativo vigente, sin exigir estrategia ni experiencia",()=>{
  const page=input();delete page.listingVariants;expect(effectivePage(page).listing).toEqual(listing);expect(effectivePage(page).experience).toBeNull();expect(effectivePage(page).components.map(c=>c.id)).toEqual(["pain-block","faq-and-text"]);
 });
 it("muestra experiencias con distinto orden aunque compartan el texto default",()=>{
  const page=input();delete page.listingVariants;page.experienceManifest={schema_version:"1.0",enabled:true,experiences:[{...experience("main",null,true),sections:[section("listing")]},{...experience("alternate","video"),sections:[section("listing"),section("faq-and-text")]}]};
  const choices=pageSelections(page);expect(choices).toHaveLength(2);expect(choices[1]).toMatchObject({angle_id:"desk",hook_id:"video"});
  expect(effectivePage(page,choices[0]).components).toEqual([]);expect(effectivePage(page,choices[1]).components.map(c=>c.id)).toEqual(["faq-and-text"]);
 });
 it("una revisión interna sin cambios visuales no deja cambios por publicar",()=>{
  const page=input();page.experienceManifest={schema_version:"1.0",enabled:true,experiences:[experience("main",null,true)]};
  const old=fingerprint(page),snapshot=publicationSnapshot(page);page.experienceManifest.experiences[0].revision++;
  expect(fingerprint(page)).toBe(old);expect(publicationChanges(page,snapshot)).toEqual([]);
 });
 it("sin principal elegida permite consultar solo las versiones efectivamente guardadas",()=>{
  const page=input();page.experienceManifest={schema_version:"1.0",enabled:true,experiences:[experience("ad","video")]};
  const choices=pageSelections(page);expect(choices.map(c=>c.key)).toEqual(["ad"]);
  expect(effectivePage(page,choices[0]).listing.title).toBe("Texto del anuncio");
 });
 it("solo compara contenido persistido; las URL de vista previa no forman parte de la publicación",()=>{
  const page=input(),snapshot=publicationSnapshot(page);expect(publicationChanges(page,snapshot)).toEqual([]);const before=fingerprint(page);page.gallery.reverse();page.gallery.push({key:"new-file",alt:"Nueva foto"});expect(fingerprint(page)).not.toBe(before);expect(publicationChanges(page,snapshot)).toEqual(["Imágenes"]);
  page.packs=[{units:1,price:24990}];expect(publicationChanges(page,snapshot)).toEqual(["Imágenes","Precio y packs"]);
 });
});
