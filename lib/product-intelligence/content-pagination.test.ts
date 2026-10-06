import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createContentExecutor } from "./content-service";
import { createLearningExecutor } from "./learning-service";
import type { ContentRepository, KnowledgeRepository, LearningRepository } from "./repository";
import { PI_SCOPES } from "./policy";
import { parseToolOutput } from "./validation";

const product = randomUUID(), principal = {userId:randomUUID(),actorId:randomUUID(),actorKind:"merchant" as const,scopes:PI_SCOPES};
const signal = () => AbortSignal.timeout(1000);
describe("PI · lecturas acotadas de contenido y aprendizaje",()=>{
  it("pagina propuestas enteras y rechaza el cursor cuando cambia el contenido",async()=>{
    const rows=Array.from({length:18},(_,i)=>({id:randomUUID(),position:i,text:"a".repeat(4000)}));
    const state={revision:3,stamp:"fixture",content_etag:"a".repeat(64),current:rows};
    const loadContent=vi.fn(async()=>state);
    const executor=createContentExecutor({loadContent} as unknown as ContentRepository & KnowledgeRepository);
    const command=(cursor?:{offset:number;revision:number;content_etag:string})=>({tool:"get_creative_content" as const,input:{product_id:product,...(cursor?{cursor}:{})}});
    const result=parseToolOutput("get_creative_content",await executor(principal,command(),signal()));if(!result.ok)throw result;
    expect(result.data.has_more).toBe(true);expect(result.data.next_cursor).not.toBeNull();
    const next=parseToolOutput("get_creative_content",await executor(principal,command(result.data.next_cursor!),signal()));if(!next.ok)throw next;
    expect((next.data.current as typeof rows)[0].id).toBe(rows[result.data.next_cursor!.offset].id);
    state.content_etag="b".repeat(64);
    await expect(executor(principal,command(result.data.next_cursor!),signal())).rejects.toMatchObject({code:"CURSOR_INVALID"});
  });
  it("no duplica inputs completos de QA en la consulta del consejo",async()=>{
    const executor=createContentExecutor({loadContent:async()=>({revision:3,stamp:"fixture",content_etag:"a".repeat(64),current:{text:"Consejo",provenance:{source:"mcp_chat",analysis_revision:2,content:{text:"Consejo",fact_ids:[]},verified_facts:[{statement:"a".repeat(9000)}]}}})} as unknown as ContentRepository & KnowledgeRepository);
    const result=parseToolOutput("get_usage_tip",await executor(principal,{tool:"get_usage_tip",input:{product_id:product}},signal()));if(!result.ok)throw result;
    expect(result.data.current).toMatchObject({provenance:{source:"mcp_chat",analysis_revision:2}});
    expect(JSON.stringify(result)).not.toContain("verified_facts");
  });
  it("pagina aprendizajes grandes por revisión sin partir un snapshot",async()=>{
    const rows=Array.from({length:20},(_,i)=>({revision:100-i,observation:"a".repeat(4000)}));
    const executor=createLearningExecutor({loadLearning:async()=>({ok:true,product_id:product,revision:100,request_id:randomUUID(),data:{items:rows,has_more:false,next_before_revision:null}})} as unknown as LearningRepository);
    const result=parseToolOutput("get_product_learning",await executor(principal,{tool:"get_product_learning",input:{product_id:product}},signal()));if(!result.ok)throw result;
    expect(result.data.items.length).toBeLessThan(20);expect(result.data.has_more).toBe(true);
    expect(result.data.next_before_revision).toBe((result.data.items.at(-1) as {revision:number}).revision);
  });
});
