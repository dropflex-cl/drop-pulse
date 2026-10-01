import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod/v4";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { angleForPrompt } from "@/lib/angles/approved";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { HOOK_PATTERNS, ON_SCREEN_PROMPT_WORDS, PATTERN_DEFS, SPOKEN_PROMPT_WORDS } from "./catalog";
import { hooksContextText, hooksSystem, hooksTail, hooksUser } from "./prompts";
import { hookProblems, hooksOutputSchema, hooksToPayload, hookTextOk, wordCount, type AngleHook, type HooksOutput } from "./schemas";
import { bestHook, hooksForPrompt, isUsable, usableHooks } from "./select";

const CL = { countryCode: "CL", currency: "CLP", language: "es", timezone: "America/Santiago" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const facts = { pricing, hasRealReviews: false, hasRealExpert: false };

const hook = (over: Partial<HooksOutput["hooks"][number]> = {}): HooksOutput["hooks"][number] => ({
  pattern: "pain",
  mechanism: "Aversión a la pérdida",
  text: "Esta vibración está dañando tu lavadora.",
  follow_up: null,
  on_screen: "¿TU LAVADORA CAMINA?",
  visual_first_3s: "Lavadora centrifugando y temblando, plano medio.",
  scores: { salience: 5, relevance: 5, credibility: 4, verifiability: 5 },
  risk: "low",
  risk_reason: "Daño a un objeto",
  needs_real_material: null,
  policy_ok: true,
  ...over,
});

// El ejemplo resuelto del agente (almohadillas antivibración), completado a 10 en 6 patrones.
const output = (): HooksOutput => ({
  diagnosis: { archetype: "visible_problem", secondary_archetype: "protection", core_pain: "La lavadora se mueve y suena horrible", main_objection: "¿De verdad funciona?", policy_risk: "low" },
  hooks: [
    hook(),
    hook({ pattern: "demo", mechanism: "Ciclo abierto", text: "Mira lo que pasa con el vaso.", on_screen: "PRUEBA DEL VASO", visual_first_3s: "Vaso de agua sobre la lavadora vibrando; con las almohadillas, quieto." }),
    hook({ text: "No es tu lavadora, es el piso.", on_screen: "NO ES LA LAVADORA", visual_first_3s: "Las patas deslizándose sobre la cerámica." }),
    hook({ pattern: "offer", mechanism: "Anclaje", text: "Un técnico te cobra más por visita.", on_screen: "4 POR $24.990", visual_first_3s: "Mano colocando las 4 almohadillas." }),
    hook({ pattern: "contrarian", mechanism: "Expectativa rota", text: "No cambies tu lavadora todavía.", on_screen: "ANTES DE COMPRAR OTRA", visual_first_3s: "Mujer mirando una lavadora nueva en el celular." }),
    hook({ pattern: "demo", mechanism: "Satisfacción visual", text: "Tienes que ver esto.", on_screen: "SIN ALMOHADILLAS VS CON", visual_first_3s: "Pantalla dividida: dos lavadoras centrifugando." }),
    hook({ pattern: "curiosity", mechanism: "Brecha de información", text: "Esto existe y casi nadie lo sabe.", on_screen: "4 PIEZAS, CERO RUIDO", visual_first_3s: "Mano sacando las almohadillas de la bolsa junto a la lavadora." }),
    hook({ pattern: "contrarian", mechanism: "Inoculación", text: "No te creas todo lo que ves en TikTok.", follow_up: "Yo la probé con un vaso de agua.", on_screen: "¿FUNCIONA DE VERDAD?", visual_first_3s: "Mujer cruzada de brazos frente a la lavadora." }),
    hook({ pattern: "fear", mechanism: "Detección de amenazas", text: "Una lavadora que camina puede romper la manguera.", on_screen: "OJO CON LA MANGUERA", visual_first_3s: "Primer plano de la manguera tensa detrás de la lavadora." }),
    hook({ pattern: "behind_scenes", mechanism: "Credibilidad", text: "Acá preparamos los pedidos que salen hoy.", on_screen: "PEDIDOS DE HOY", visual_first_3s: "Mesa con cajas y las almohadillas.", needs_real_material: "Grabar la bodega con los pedidos" }),
  ],
  top: [
    { hook: 1, why: "Movimiento, ciclo abierto y prueba verificable.", variant: { changes: "spoken", text: "Esta vibración está dañando tu lavadora." } },
    { hook: 0, why: "Daño concreto a algo que ya tiene.", variant: { changes: "visual", text: "Vaso cayéndose de la lavadora." } },
    { hook: 2, why: "Falso culpable.", variant: { changes: "on_screen", text: "EL PROBLEMA ES EL PISO" } },
  ],
  production_notes: ["Grabar la prueba del vaso con el producto real."],
});

describe("hookProblems", () => {
  it("acepta el ejemplo del agente", () => {
    expect(hookProblems(output(), facts)).toEqual([]);
  });

  it("pide 10 ganchos en al menos 5 patrones y no más de 3 por patrón", () => {
    const o = output();
    o.hooks = o.hooks.map((h) => ({ ...h, pattern: ["fear", "curiosity", "offer", "behind_scenes"].includes(h.pattern) ? "pain" : h.pattern }));
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/usan 3 patrones/);
    expect(p).toMatch(/6 ganchos de Dolor/);
    o.hooks = o.hooks.slice(0, 9);
    expect(hookProblems(o, facts).join(" ")).toMatch(/Trae 9 ganchos/);
  });

  it("cuenta las palabras del hablado y del texto en pantalla", () => {
    const o = output();
    o.hooks[0] = hook({ text: "Esta vibración que escuchas cada semana está dañando tu lavadora nueva.", on_screen: "TU LAVADORA CAMINA SOLA POR LA CASA" });
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/hablado tiene 11 palabras/);
    expect(p).toMatch(/pantalla tiene 7 palabras/);
  });

  it("descarta los que tienen 2 o menos en un criterio", () => {
    const o = output();
    o.hooks[4] = hook({ pattern: "contrarian", text: "No compres otra lavadora.", scores: { salience: 4, relevance: 4, credibility: 2, verifiability: 4 } });
    expect(hookProblems(o, facts).join(" ")).toMatch(/2 en credibility: descártalo/);
  });

  it("no deja atribuirle al espectador una condición ni prometer salud o plazos", () => {
    const o = output();
    o.hooks[0] = hook({ text: "¿Te estás quedando calvo?", on_screen: "TU PIEL EN DOS SEMANAS" });
    o.hooks[2] = hook({ text: "Esto cura el dolor de espalda.", on_screen: "ADIÓS DOLOR" });
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/El gancho 1: «¿Te estás quedando calvo\?» le atribuye/);
    expect(p).toMatch(/TU PIEL EN DOS SEMANAS» le atribuye/);
    expect(p).toMatch(/plazo de resultado/);
    expect(p).toMatch(/promete un resultado de salud/);
  });

  it("solo montos de PRECIO Y OFERTA, también hablados sin símbolo", () => {
    const o = output();
    o.hooks[3] = hook({ pattern: "offer", text: "Cuatro almohadillas por 15 mil pesos.", on_screen: "4 POR $19.990" });
    const p = hookProblems(o, facts);
    expect(p.filter((x) => x.includes("monto"))).toHaveLength(2);
    o.hooks[3] = hook({ pattern: "offer", text: "Cuatro almohadillas por 24 mil 990 pesos.", on_screen: "4 POR $24.990" });
    expect(hookProblems(o, facts).filter((x) => x.includes("monto"))).toHaveLength(0);
  });

  it("el pago contra entrega no va en el gancho", () => {
    const o = output();
    o.hooks[6] = hook({ pattern: "curiosity", text: "Pagas al recibir y envío gratis.", on_screen: "CONTRAENTREGA" });
    expect(hookProblems(o, facts).join(" ")).toMatch(/van en el título y el texto del anuncio/);
  });

  it("confesión, comentario o experto sin material real: tiene que decir qué falta", () => {
    const o = output();
    o.hooks[8] = hook({ pattern: "confession", text: "Pensé que era puro cuento, pero…", on_screen: "PENSÉ QUE ERA CUENTO" });
    expect(hookProblems(o, facts).join(" ")).toMatch(/es de Confesión y la ficha no trae ese material real/);
    expect(hookProblems(o, { ...facts, hasRealReviews: true })).toEqual([]);
    o.hooks[9] = hook({ pattern: "behind_scenes", text: "Acá preparamos los pedidos de hoy.", on_screen: "PEDIDOS DE HOY", needs_real_material: null });
    expect(hookProblems(o, { ...facts, hasRealReviews: true }).join(" ")).toMatch(/Bastidores/);
  });

  it("el top son 3 ganchos distintos, sin riesgo alto", () => {
    const o = output();
    o.top[2] = { ...o.top[2], hook: 9 };
    o.hooks[9] = { ...o.hooks[9], risk: "high" };
    o.top[1] = { ...o.top[1], hook: 1 };
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/top 2 repite el gancho 2/);
    expect(p).toMatch(/top 3 es el gancho 10, que tiene riesgo alto/);
    o.top = o.top.slice(0, 2);
    expect(hookProblems(o, facts).join(" ")).toMatch(/top trae 2/);
  });
});

describe("hooksToPayload y la selección", () => {
  it("el recomendado es el primero del top y se guarda el diagnóstico", () => {
    const p = hooksToPayload(output());
    expect(p.recommended_hook).toBe(1);
    expect(p.hooks).toHaveLength(10);
    expect(p.hook_diagnosis?.archetype).toBe("visible_problem");
    expect(p.hooks_error).toBeNull();
  });

  it("los pasos con IA no usan los que piden material real, los de riesgo alto ni los que rozan la política", () => {
    const p = hooksToPayload(output());
    p.hooks[3] = { ...p.hooks[3], risk: "high" };
    p.hooks[4] = { ...p.hooks[4], policy_ok: false };
    const usable = usableHooks(p).map((u) => u.index);
    expect(usable.slice(0, 3)).toEqual([1, 0, 2]);
    expect(usable).not.toContain(3);
    expect(usable).not.toContain(4);
    expect(usable).not.toContain(9);
    expect(bestHook(p)?.text).toBe("Mira lo que pasa con el vaso.");
    expect(hooksForPrompt(p)[0]).toMatchObject({ index: 1, pattern: "Demostración (demo)", on_screen: "PRUEBA DEL VASO" });
  });

  it("lee los ganchos de antes (solo texto, visual y policy_ok)", () => {
    const old = { hooks: [{ text: "Uno", visual_first_3s: "", policy_ok: false }, { text: "Dos", visual_first_3s: "Algo", policy_ok: true }] as AngleHook[], recommended_hook: 0 };
    expect(usableHooks(old).map((u) => u.index)).toEqual([1]);
    expect(hooksForPrompt(old)[0]).toEqual({ index: 1, spoken: "Dos", visual_first_3s: "Algo" });
  });

  it("un gancho editado se revisa con las reglas de código", () => {
    expect(hookTextOk("Me maquillo en siete minutos")).toBe(true);
    expect(hookTextOk("¿Tus arrugas no se van?")).toBe(false);
    expect(isUsable({ text: "Hola", visual_first_3s: "", policy_ok: true, edited: true })).toBe(true);
  });

  it("cuenta palabras sin signos sueltos", () => {
    expect(wordCount("Mira esto — solo mira.")).toBe(4);
  });
});

describe("prompt del agente de ganchos", () => {
  const payload = { core_message: "Quieta y en silencio", psychological_lever: "Pérdida", aida_summary: { attention: "a", interest: "b", desire: "c", action: "d" }, proof_to_show: [], visual_concepts: [], compliance_flags: [], details: {}, hooks: [], recommended_hook: 0 } as unknown as AngleBriefPayload;
  const ctx = {
    brief: { product_name: "Almohadillas", proof: { real_reviews: [] } } as unknown as ProductBrief,
    avatar: AVATAR,
    pricing,
    angle: angleForPrompt({ slot: 1, frame: "unique_mechanism", title: "No es la lavadora", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "" }, payload),
    others: ["«Oferta» (Oferta)"],
    frameTemplates: ["«No es tu [causa supuesta]. Es tu [causa real].»"],
    hasImage: true,
  };

  it("el system solo depende del mercado, en tuteo y con los largos del prompt", () => {
    const sys = hooksSystem(CL);
    expect(sys).toBe(hooksSystem(CL));
    expect(sys).toContain("español neutro con tuteo");
    expect(sys).toContain("$19.990");
    expect(sys).toContain(`máximo ${SPOKEN_PROMPT_WORDS} palabras`);
    expect(sys).toContain(`máximo ${ON_SCREEN_PROMPT_WORDS} palabras`);
    expect(sys).not.toMatch(/\bquerés\b|\bllevá\b|\bcomprá\b|voseo \(/);
    for (const p of HOOK_PATTERNS) expect(sys).toContain(`${p} — `);
    expect(sys).not.toContain("Quieta y en silencio");
  });

  it("los patrones que piden material real lo dicen", () => {
    expect(Object.entries(PATTERN_DEFS).filter(([, d]) => d.needsReal).map(([p]) => p)).toEqual(["confession", "authority", "behind_scenes", "comment_reply"]);
  });

  it("el usuario trae el ángulo, las plantillas de la forma y los otros ángulos", () => {
    const u = hooksUser(ctx);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("Ángulo 1: No es la lavadora");
    expect(u).toContain("PLANTILLAS DE LA FORMA MECANISMO ÚNICO");
    expect(u).toContain("«Oferta» (Oferta)");
    expect(hooksContextText(ctx)).toBe(hooksContextText(ctx));
    expect(hooksTail(["Trae 9."], ["Mira esto."])).toMatch(/YA TIENE[\s\S]*Mira esto[\s\S]*Trae 9/);
  });

  it("el esquema compila a JSON schema", () => {
    expect(toJSONSchema(hooksOutputSchema)).toHaveProperty("properties.hooks");
  });
});
