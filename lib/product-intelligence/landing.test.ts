import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { publishedSchemas } from "./mcp";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { createLandingExecutor, validateLandingProposal } from "./landing-service";
import { productPresentation } from "@/lib/products/presentation";
import { contextFixture } from "./test-fixtures";
import { DEFAULT_ACCENT } from "@/lib/copy/accent";
import { LISTING_RULES } from "@/lib/copy/listing";

const id = randomUUID();
const owner: Principal = {
  userId: id,
  actorId: id,
  actorKind: "merchant",
  scopes: PI_SCOPES,
};
const listing = {
  title: "Organizador para tu escritorio",
  short_name: "Organizador",
  short_description:
    "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
  offer_line: "Organiza tu escritorio · Paga al recibir",
  seo_title: "Organizador para escritorio",
  seo_description:
    "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa.",
};
const request = () => ({
  product_id: id,
  schema_version: "1.0",
  expected_revision: 1,
  expected_landing_etag: "a".repeat(64),
  idempotency_key: randomUUID(),
  entries: [{ component: "listing", content: listing }],
});
function raw() {
  return {
    revision: 1,
    stamp: "b".repeat(64),
    landing_etag: "a".repeat(64),
    context_stale: false,
    rows: [],
    reviews: [],
    review_count: 0,
    snapshot: {
      context: null,
      settings: null,
      knowledge: { graph: { Fact: [] } },
      pricing: {
        currency: "CLP",
        unit_cost: 4000,
        avg_shipping_cost: 3000,
        purchase_cost_limit: 3000,
        confirmation_rate: 75,
        delivery_rate: 75,
        sale_price: 19990,
        compare_at_price: null,
        extra_unit_discount: 50,
        minimum_price: 15000,
        recommended_price: 19990,
        profit: 6000,
        max_cpa: null,
        beroas: null,
        packs: [],
      },
    },
  };
}
describe("PI · contenido de Shopify desde chat", () => {
  it.each(["listing", "pain-block"])("la proyección de %s mantiene la respuesta y evita las lecturas amplias", async component => {
    const full = { ...raw(), image_catalog: [{ source: "reference", id: randomUUID() }] };
    const legacy = { loadLanding: vi.fn(async () => full), commitLanding: vi.fn(), loadPageAccent: vi.fn(async () => null) };
    const projected = { ...legacy, readLandingComponent: vi.fn(async () => ({ ...full, stamp: undefined, snapshot: {
      pricing: full.snapshot.pricing, settings: full.snapshot.settings,
    }, page_accent_color: null })) };
    const command = { tool: "get_landing_content" as const, input: parseToolInput("get_landing_content", { product_id: id, component }) };
    const before = await createLandingExecutor(legacy)(owner, command, AbortSignal.timeout(1000));
    legacy.loadLanding.mockClear(); legacy.loadPageAccent.mockClear();
    const after = await createLandingExecutor(projected)(owner, command, AbortSignal.timeout(1000));
    expect({ ...after as object, request_id: null }).toEqual({ ...before as object, request_id: null });
    if (component === "listing") expect(after).toMatchObject({ data: { contract: { rules: LISTING_RULES } } });
    expect(projected.readLandingComponent).toHaveBeenCalledWith(expect.objectContaining({ p_component: component }), expect.any(AbortSignal));
    expect(legacy.loadLanding).not.toHaveBeenCalled(); expect(legacy.loadPageAccent).not.toHaveBeenCalled();
  });
  it.each(["#0f766e", null])("lee el acento vigente después de autorizar el producto (%s)", async accent => {
    const repository = { loadLanding: vi.fn(async () => raw()), commitLanding: vi.fn(), loadPageAccent: vi.fn(async () => accent) };
    const signal = AbortSignal.timeout(1000);
    const result = await createLandingExecutor(repository)(owner, {
      tool: "get_landing_content", input: parseToolInput("get_landing_content", { product_id: id, component: "listing" }),
    }, signal);
    expect(result).toMatchObject({ ok: true, data: { appearance: { accent_color: accent ?? DEFAULT_ACCENT, accent_source: accent === null ? "default" : "product" } } });
    expect(repository.loadPageAccent).toHaveBeenCalledWith(owner.userId, id, signal);
    expect(repository.loadLanding.mock.invocationCallOrder[0]).toBeLessThan(repository.loadPageAccent.mock.invocationCallOrder[0]);
  });
  it("una lectura no autorizada no recupera el acento", async () => {
    const repository = { loadLanding: vi.fn(async () => { throw new Error("FORBIDDEN"); }), commitLanding: vi.fn(), loadPageAccent: vi.fn() };
    await expect(createLandingExecutor(repository)(owner, {
      tool: "get_landing_content", input: parseToolInput("get_landing_content", { product_id: id }),
    }, AbortSignal.timeout(1000))).rejects.toThrow("FORBIDDEN");
    expect(repository.loadPageAccent).not.toHaveBeenCalled();
  });
  it("deriva todos los componentes del catálogo real, con campos y límites", () => {
    const schema = publishedSchemas().save_landing_content.input;
    expect(JSON.stringify(schema)).toContain("seo_description");
    expect(JSON.stringify(schema)).toContain("faq-and-text");
    for (const c of CATALOG)
      expect(() =>
        parseToolInput("save_landing_content", {
          ...request(),
          entries: [{ component: c.id, content: c.examples[0] }],
        }),
      ).not.toThrow();
  });
  it("rechaza IDs ajenos al catálogo, repetidos, HTML y campos inventados anidados", () => {
    expect(() =>
      parseToolInput("save_landing_content", {
        ...request(),
        entries: [{ component: "fake", content: listing }],
      }),
    ).toThrow();
    const r = request();
    expect(() =>
      parseToolInput("save_landing_content", {
        ...r,
        entries: [...r.entries, ...r.entries],
      }),
    ).toThrow();
    expect(() =>
      parseToolInput("save_landing_content", {
        ...r,
        entries: [
          {
            component: "listing",
            content: { ...listing, title: "<b>Nombre de producto</b>" },
          },
        ],
      }),
    ).toThrow();
    const c = CATALOG.find((c) => c.id === "inventory")!;
    expect(() =>
      parseToolInput("save_landing_content", {
        ...r,
        entries: [
          {
            component: c.id,
            content: { ...(c.examples[0] as object), actual_stock: 500 },
          },
        ],
      }),
    ).toThrow();
  });
  it("listing admite tres beneficios de galería y conserva las fichas anteriores", () => {
    const benefits = [
      { icon: "package", text: "Todo en su lugar" },
      { icon: "eye", text: "Encuentra tus útiles" },
      { icon: "home", text: "Aprovecha tu escritorio" },
    ];
    const save = (gallery_benefits: unknown) =>
      parseToolInput("save_landing_content", {
        ...request(),
        entries: [
          { component: "listing", content: { ...listing, gallery_benefits } },
        ],
      });
    expect(save(benefits)).toMatchObject({
      entries: [{ content: { gallery_benefits: benefits } }],
    });
    expect(() =>
      parseToolInput("save_landing_content", request()),
    ).not.toThrow();
    for (const invalid of [
      benefits.slice(1),
      [...benefits, benefits[0]],
      [benefits[0], benefits[0], benefits[2]],
      [{ ...benefits[0], icon: "invented" }, ...benefits.slice(1)],
      [{ ...benefits[0], text: "<b>Beneficio</b>" }, ...benefits.slice(1)],
    ]) {
      expect(() => save(invalid)).toThrow();
    }
    expect(
      JSON.stringify(publishedSchemas().save_landing_content.input),
    ).toContain("gallery_benefits");
  });
  it("lee un contrato por llamada con catálogo y datos reales", async () => {
    const repository = {
      loadLanding: vi.fn(async () => raw()),
      commitLanding: vi.fn(),
    };
    const run = createLandingExecutor(repository);
    const result = parseToolOutput(
      "get_landing_content",
      await run(
        owner,
        {
          tool: "get_landing_content",
          input: parseToolInput("get_landing_content", {
            product_id: id,
            component: "faq-and-text",
          }),
        },
        AbortSignal.timeout(1000),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        contract: { component: "faq-and-text" },
        current: null,
        review_count: 0,
      },
    });
    if (result.ok) {
      expect(result.data.catalog).toHaveLength(CATALOG.length + 1);
      expect(result.data.catalog.every(component => component.available && component.min_reviews === 0)).toBe(true);
      expect(result.data.contract.forbidden).toEqual([]);
    }
    const listingRead = parseToolOutput("get_landing_content", await run(owner, {
      tool: "get_landing_content", input: parseToolInput("get_landing_content", { product_id: id, component: "listing" }),
    }, AbortSignal.timeout(1000)));
    if (listingRead.ok) expect(listingRead.data.contract.forbidden).toEqual(["HTML."]);
    expect(repository.commitLanding).not.toHaveBeenCalled();
  });
  it("conserva el precio operativo y permite copy sin evidencia ni mínimos de reseñas", () => {
    expect(() => validateLandingProposal(raw(), [{ component: "listing", content: { ...listing, offer_line: "Llévalo por $99.999 · Paga al recibir" } }])).toThrow();
    expect(() => validateLandingProposal(raw(), [{ component: "listing", content: { ...listing, gallery_benefits: [
      { icon: "ruler", text: "Capacidad de 500 útiles" }, { icon: "eye", text: "Encuentra tus útiles" }, { icon: "home", text: "Aprovecha tu escritorio" },
    ] } }, { component: "review-wall", content: CATALOG.find(c => c.id === "review-wall")!.examples[0] }])).not.toThrow();
  });
  it("guarda resultados, expertos e imágenes generadas sin fact_id y conserva pertenencia de archivos", () => {
    const stripFacts = (value: unknown): unknown => Array.isArray(value) ? value.map(stripFacts) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "fact_id").map(([key, child]) => [key, stripFacts(child)])) : value;
    const image = randomUUID();
    const data = { ...raw(), image_catalog: [{ source: "page_image", id: image }] };
    const entries = ["before-after", "results-timeline", "expert-endorsement", "mechanism"].map(component => ({ component,
      content: [{ key: "default", angle_id: null, hook_id: null, content: stripFacts(CATALOG.find(c => c.id === component)!.examples[0]),
        ...(component === "before-after" ? { images: [{ slot: "before", source: "page_image", id: image }, { slot: "after", source: "page_image", id: image }] } : {}) }],
    }));
    expect(() => validateLandingProposal(data, entries)).not.toThrow();
    expect(() => validateLandingProposal(raw(), entries)).toThrow("no pertenece");
    expect(() => validateLandingProposal(raw(), [{ component: "customer-stories", content: { heading: "En la rutina de todos los días", stories: [{ title: "En el escritorio", body: "Mantengo todo a mano durante el trabajo.", name: "María" }] } }])).not.toThrow();
  });
  it("descubre estado vacío y acepta todos los componentes sin testimonios de relleno", async () => {
    const read = raw();
    const entries = [
      ...request().entries,
      ...CATALOG.map((c) => ({ component: c.id, content: { state: "empty" } })),
    ];
    expect(() =>
      parseToolInput("save_landing_content", { ...request(), entries }),
    ).not.toThrow();
    const { validateLandingProposal } = await import("./landing-service");
    expect(() => validateLandingProposal(read, entries)).not.toThrow();
    const repository = {
      loadLanding: vi.fn(async () => read),
      commitLanding: vi.fn(),
    };
    const result = await createLandingExecutor(repository)(
      owner,
      {
        tool: "get_landing_content",
        input: parseToolInput("get_landing_content", {
          product_id: id,
          component: "before-after",
        }),
      },
      AbortSignal.timeout(1000),
    );
    expect(result).toMatchObject({
      data: {
        contract: {
          enabled_by_default: true,
          empty_state: { heading: "Mira la diferencia" },
        },
      },
    });
  });
  it("no exige providers y reautoriza antes de replay", async () => {
    const result = {
      ok: true,
      product_id: id,
      revision: 1,
      request_id: id,
      data: {
        applied: true,
        dry_run: false,
        run_id: id,
        landing_etag: "c".repeat(64),
        components: [{ component: "listing", id, status: "generated" }],
        next_action: "Revisa",
      },
    };
    const repository = {
        loadLanding: vi.fn(async () => ({ replay: result })),
        commitLanding: vi.fn(),
      },
      run = createLandingExecutor(repository);
    const command = {
      tool: "save_landing_content" as const,
      input: parseToolInput("save_landing_content", request()),
    };
    expect(await run(owner, command, AbortSignal.timeout(1000))).toEqual(
      result,
    );
    await expect(
      run(
        { ...owner, scopes: ["product_intelligence:read"] },
        command,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.loadLanding).toHaveBeenCalledTimes(1);
  });
  it("la edición de duración no depende de estados de evidencia", async () => {
    const data = raw(),
      frozen = contextFixture();
    const fact = {
      ...frozen.strategy.facts[0],
      statement: "Rendimiento de treinta usos",
      value: "30 usos",
      verification_status: "verified",
      usage_status: "approved",
    };
    const link = {
      ...frozen.strategy.evidence_links[0],
      fact_id: fact.id,
      relation: "contradicts",
    };
    const faq = CATALOG.find((c) => c.id === "faq-and-text")!.examples[0] as {
      items: unknown[];
    };
    const content = {
      ...faq,
      items: [
        ...faq.items,
        {
          question: "¿Cuánto me dura?",
          answer:
            "Cada envase alcanza para treinta días, con 30 usos según el rendimiento.",
          topic: "duracion",
        },
      ],
    };
    expect(() => parseToolInput("save_landing_content", {
        ...request(),
        entries: [{ component: "faq-and-text", content }],
      })).not.toThrow();
    expect(() => validateLandingProposal({ ...data, snapshot: { ...data.snapshot,
      knowledge: { graph: { Fact: [fact], EvidenceLink: [link] } },
    } }, [{ component: "faq-and-text", content }])).not.toThrow();
  });
  it("contenido de chat queda disponible sin una fase de revisión", () => {
    expect(productPresentation({ content: { hasContent: true, missing: [], stale: false } })).toMatchObject({ contentState: "ready", publicationReady: true });
  });
});
