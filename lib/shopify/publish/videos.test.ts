import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ensureVideos } from "./files";
import type { ShopifyConnection } from "@/lib/integrations/shopify/connection";
const mocks = vi.hoisted(() => ({ cache: [] as {source_key:string;file_gid:string}[], download: vi.fn(), mutation: vi.fn(), query: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/integrations/admin", () => ({ adminClient: () => ({
  from: () => ({ select() { return this; }, eq() { return this; }, in: async () => ({data:mocks.cache,error:null}), upsert: mocks.save }),
  storage: { from: () => ({download:mocks.download}) },
}) }));
vi.mock("@/lib/integrations/shopify/client", () => ({shopifyMutation:mocks.mutation,shopifyQuery:mocks.query}));
const conn={user_id:"owner",shop_domain:"store.myshopify.com"} as ShopifyConnection;
const video={key:"creative-media/owner/product/final.mp4",bucket:"creative-media",path:"owner/product/final.mp4",alt:"Video del producto"};
beforeEach(() => {
  vi.clearAllMocks();mocks.cache=[];
  mocks.download.mockResolvedValue({data:new Blob(["synthetic local MP4 fixture"]),error:null});
  mocks.save.mockImplementation(async (row) => {mocks.cache=[{source_key:row.source_key,file_gid:row.file_gid}];return {error:null};});
  mocks.mutation.mockImplementation(async (_conn, query) => query.includes("stagedUploadsCreate") ? {stagedUploadsCreate:{stagedTargets:[{url:"https://upload.example.test",resourceUrl:"https://file.example.test",parameters:[]}],userErrors:[]}} : {fileCreate:{files:[{id:"gid://shopify/Video/1",fileStatus:"PROCESSING"}],userErrors:[]}});
  mocks.query.mockResolvedValue({nodes:[{id:"gid://shopify/Video/1",fileStatus:"READY",fileErrors:[]}]});
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("",{status:200})));
});
afterEach(()=>vi.unstubAllGlobals());
describe("UGC · archivos de video de Shopify",()=>{
  it("sube VIDEO una vez, guarda caché antes del polling y reutiliza el archivo",async()=>{
    mocks.query.mockImplementation(async()=>{expect(mocks.cache).toHaveLength(1);return {nodes:[{id:"gid://shopify/Video/1",fileStatus:"READY"}]};});
    const first=await ensureVideos(conn,"product",[video,video]);expect(first.get(video.key)).toBe("gid://shopify/Video/1");
    expect(mocks.mutation.mock.calls[0][2].input[0]).toMatchObject({resource:"VIDEO",mimeType:"video/mp4",httpMethod:"POST"});
    expect(mocks.mutation.mock.calls[1][2].files[0]).toMatchObject({contentType:"VIDEO",originalSource:"https://file.example.test"});
    expect(mocks.download).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1);
    const again=await ensureVideos(conn,"product",[video]);expect(again).toEqual(first);expect(mocks.mutation).toHaveBeenCalledTimes(2);expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it("espera un GID ya en procesamiento sin volver a subir ni crear",async()=>{
    mocks.cache=[{source_key:video.key,file_gid:"gid://shopify/Video/1"}];
    mocks.query.mockResolvedValueOnce({nodes:[{id:"gid://shopify/Video/1",fileStatus:"PROCESSING"}]}).mockResolvedValue({nodes:[{id:"gid://shopify/Video/1",fileStatus:"READY"}]});
    expect((await ensureVideos(conn,"product",[video])).get(video.key)).toBe("gid://shopify/Video/1");
    expect(mocks.mutation).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it("un archivo rechazado conserva el GID y exige reintento explícito",async()=>{
    mocks.query.mockResolvedValue({nodes:[{id:"gid://shopify/Video/1",fileStatus:"FAILED",fileErrors:[]}]});
    await expect(ensureVideos(conn,"product",[video])).rejects.toThrow("procesar el video");
    expect(mocks.cache).toHaveLength(1);expect(mocks.mutation).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledTimes(1);
  });
});
