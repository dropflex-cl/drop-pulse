import { beforeEach, describe, expect, it, vi } from "vitest";
import { montagePackage } from "@/lib/pipeline/video";
import { buildChatUgc } from "@/lib/product-intelligence/ugc-service";
import { ugcInputFixture } from "@/lib/product-intelligence/ugc-fixtures";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { hasReadyClips, videoStep, type ScriptRow, type ShotRow } from "./store";

const mocks = vi.hoisted(() => ({
  script: vi.fn(), shots: vi.fn(), rpc: vi.fn(), references: vi.fn(),
  select: vi.fn(), eq: vi.fn(), single: vi.fn(), bucket: vi.fn(), signed: vi.fn(),
}));
vi.mock("@/lib/video/store", async original => ({ ...await original<typeof import("./store")>(), getScriptRow: mocks.script, shotsFor: mocks.shots }));
vi.mock("@/lib/products/store", async original => ({ ...await original<typeof import("@/lib/products/store")>(), listImageRows: mocks.references }));
vi.mock("@/lib/integrations/admin", () => ({ adminClient: () => ({ rpc: mocks.rpc, from: () => ({ select: mocks.select }), storage: { from: mocks.bucket } }) }));

const pricing = buildPricingPlan({ unitCost: 4000, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75, extraUnitDiscount: 50, salePrice: 29990, compareAtPrice: 39990 }, "CLP")!;
const payload = buildChatUgc(ugcInputFixture(), pricing);
const script = { id: "script", status: "succeeded", source: "mcp_chat", format: "ugc", payload, input: { market: { language: "es" }, angle_name: "Escritorio" },
  provenance: { context_stamp: "historical" }, artifact_etag: "a".repeat(64), final_storage_path: null } as unknown as ScriptRow;
const ready = () => [...payload.a_roll, ...payload.b_roll].map(s => ({ key: s.key, kind: s.key.startsWith("A") ? "a_roll" : "b_roll", render_status: "succeeded", status: "in_review", storage_path: `${s.key}.mp4` })) as ShotRow[];

describe("montaje disponible desde clips existentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.script.mockResolvedValue(script);
    mocks.shots.mockResolvedValue(ready());
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, single: mocks.single });
    mocks.single.mockResolvedValue({ data: { title: "Organizador" }, error: null });
    mocks.bucket.mockReturnValue({ createSignedUrls: mocks.signed });
    mocks.signed.mockImplementation(async (paths: string[]) => ({ data: paths.map(path => ({ signedUrl: `https://storage.test/${path}` })), error: null }));
    mocks.rpc.mockRejectedValue(new Error("No se consulta el contexto antiguo"));
    mocks.references.mockRejectedValue(new Error("No se consulta una foto de cierre"));
  });
  it("descarga sin keyframes, Shopify ni contexto antiguo; solo firma los clips", async () => {
    const pkg = await montagePackage("owner", "product", "script");
    expect(pkg).toMatchObject({ version: 3, source: { script_id: "script" } });
    expect(pkg.a_roll).toHaveLength(payload.a_roll.length);
    expect(pkg.b_roll).toHaveLength(payload.b_roll.length);
    expect(mocks.select).toHaveBeenCalledWith("title");
    expect(mocks.bucket).toHaveBeenCalledOnce();
    expect(mocks.bucket).toHaveBeenCalledWith("creative-media");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.references).not.toHaveBeenCalled();
    expect(videoStep(script, [], ready())).toBe("montage");
  });
  it("no habilita el montaje por archivos ausentes, fallidos o descartados", async () => {
    for (const patch of [{ storage_path: null }, { render_status: "failed" }, { status: "rejected" }]) {
      const clips = ready(); Object.assign(clips[0], patch);
      expect(hasReadyClips(payload, clips)).toBe(false);
      mocks.shots.mockResolvedValueOnce(clips);
      await expect(montagePackage("owner", "product", "script")).rejects.toThrow("Faltan clips disponibles");
    }
    const unsigned = ready();
    mocks.signed.mockResolvedValueOnce({ data: unsigned.map(() => ({ signedUrl: null })), error: null });
    await expect(montagePackage("owner", "product", "script")).rejects.toThrow("Falta el clip");
  });
  it("conserva acceso al final y exige referencias reales para clips todavía pendientes", () => {
    expect(videoStep({ ...script, final_storage_path: "final.mp4" }, [], [])).toBe("final");
    expect(videoStep(script, [], ready().slice(1))).toBe("keyframes");
    const keyframes = payload.keyframes.map(k => ({ key: k.key, render_status: "succeeded", status: "approved" })) as ShotRow[];
    expect(videoStep(script, keyframes, ready().slice(1))).toBe("clips");
  });
});
