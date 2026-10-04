import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod/v4";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import { avatarStepSchema, type ProductBrief } from "@/lib/ai/schemas";
import { angleForPrompt } from "@/lib/angles/approved";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { HOOK_PATTERNS, ON_SCREEN_PROMPT_WORDS, PATTERN_DEFS, SPOKEN_PROMPT_WORDS } from "./catalog";
import { critiqueFor, hookCriticProblems, hookCriticSchema, hookCriticSystem, hookCriticUser, stopsCount, toHooksReview, type HookCriticOutput } from "./critic";
import { hooksAsk, hooksContextText, hooksSystem, hooksTail, hooksUser, hooksVoice } from "./prompts";
import { hookProblems, HOOKS_PROMPT_VERSION, hooksOutputSchema, hooksToPayload, hookTextOk, normalizeHooks, wordCount, type AngleHook, type HooksOutput } from "./schemas";
import { bestHook, hooksForPrompt, isUsable, usableHooks } from "./select";

const CL = { countryCode: "CL", currency: "CLP", language: "es", timezone: "America/Santiago" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
// Lo que dice quien compra.
const VOICE = ["La lavadora se me va hasta la puerta", "Pensé que se iba a romper el piso", "Suena como si fuera a despegar"];
const facts = { pricing, hasRealReviews: false, hasRealExpert: false, buyerVoice: VOICE };

const hook = (over: Partial<HooksOutput["hooks"][number]> = {}): HooksOutput["hooks"][number] => ({
  pattern: "pain",
  text: "Esta vibración está dañando tu lavadora.",
  follow_up: null,
  on_screen: "¿TU LAVADORA CAMINA?",
  visual_first_3s: "Lavadora centrifugando y temblando, el teléfono en la mano desde la puerta.",
  silent_read: "Una lavadora que se mueve sola.",
  source_quote: null,
  delivery: "surprised",
  rank: 1,
  risk: "low",
  risk_reason: "Daño a un objeto",
  needs_real_material: null,
  policy_ok: true,
  opening_shot: "problem_scene",
  first_motion: "La lavadora tiembla y avanza unos centímetros.",
  ...over,
});

// El ejemplo de las almohadillas antivibración: 10 ganchos.
const output = (): HooksOutput => ({
  diagnosis: { archetype: "visible_problem", main_objection: "¿De verdad funciona?", policy_risk: "low" },
  hooks: [
    hook({ rank: 1, text: "Mi lavadora se fue sola hasta la puerta.", source_quote: "La lavadora se me va hasta la puerta" }),
    hook({ rank: 2, pattern: "demo", text: "Mira lo que pasa con el vaso.", on_screen: "PRUEBA DEL VASO", visual_first_3s: "Vaso de agua sobre la lavadora vibrando; con las almohadillas, quieto.", opening_shot: "real_footage" }),
    hook({ rank: 3, text: "Pensé que se iba a romper el piso.", follow_up: "Era otra cosa.", source_quote: "Pensé que se iba a romper el piso", on_screen: "NO ES LA LAVADORA", visual_first_3s: "Las patas deslizándose sobre la cerámica." }),
    hook({ rank: 4, pattern: "offer", text: "Un técnico te cobra más por visita.", on_screen: "4 POR $24.990", visual_first_3s: "La mano coloca las 4 almohadillas.", opening_shot: "pov_hands" }),
    hook({ rank: 5, pattern: "contrarian", text: "No cambies tu lavadora todavía.", on_screen: "ANTES DE COMPRAR OTRA", visual_first_3s: "Una mujer a la cámara frontal levanta la mano para frenar.", opening_shot: "selfie_talk" }),
    hook({ rank: 6, pattern: "demo", text: "Tienes que ver esto.", on_screen: "SIN ALMOHADILLAS VS CON", visual_first_3s: "Pantalla dividida: dos lavadoras centrifugando.", opening_shot: "real_footage" }),
    hook({ rank: 7, pattern: "curiosity", text: "Esto existe y casi nadie lo sabe.", on_screen: "4 PIEZAS, CERO RUIDO", visual_first_3s: "La mano saca las almohadillas de la bolsa junto a la lavadora.", opening_shot: "pov_hands" }),
    hook({ rank: 8, pattern: "contrarian", text: "No te creas todo lo que ves en TikTok.", follow_up: "Yo la probé con un vaso de agua.", on_screen: "¿FUNCIONA DE VERDAD?", visual_first_3s: "Mujer cruzada de brazos frente a la lavadora.", opening_shot: "selfie_talk" }),
    hook({ rank: 9, pattern: "fear", text: "Suena como si fuera a despegar.", follow_up: "Y la manguera se tensa.", source_quote: "Suena como si fuera a despegar", on_screen: "OJO CON LA MANGUERA", visual_first_3s: "La manguera tensa detrás de la lavadora, el teléfono asomado por el costado." }),
    hook({ rank: 10, pattern: "behind_scenes", text: "Acá preparamos los pedidos que salen hoy.", on_screen: "PEDIDOS DE HOY", visual_first_3s: "Mesa con cajas y las almohadillas.", needs_real_material: "Grabar la bodega con los pedidos", opening_shot: "real_footage" }),
  ],
});

describe("hookProblems", () => {
  it("acepta el ejemplo", () => {
    expect(hookProblems(output(), facts)).toEqual([]);
  });

  it("pide 10 ganchos, sin cuotas de patrones", () => {
    const o = output();
    o.hooks = o.hooks.map((h) => ({ ...h, pattern: "pain" as const }));
    expect(hookProblems(o, facts)).toEqual([]);
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

  it("el ancla de mercado que verificó el comerciante también se puede usar", () => {
    const o = output();
    o.hooks[3] = hook({ pattern: "offer", text: "La consulta cuesta 400 mil pesos. Esto no.", on_screen: "NO $400.000" });
    expect(hookProblems(o, facts).filter((x) => x.includes("monto"))).toHaveLength(2);
    expect(hookProblems(o, { ...facts, marketAmounts: [400000] }).filter((x) => x.includes("monto"))).toHaveLength(0);
  });

  it("el pago contra entrega no va en el gancho", () => {
    const o = output();
    o.hooks[6] = hook({ pattern: "curiosity", text: "Pagas al recibir y envío gratis.", on_screen: "CONTRAENTREGA" });
    expect(hookProblems(o, facts).join(" ")).toMatch(/van en el título y el texto del anuncio/);
  });

  it("pide lo que se entiende sin sonido, un delivery válido y qué se mueve en la primera imagen", () => {
    const o = output();
    o.hooks[0] = { ...o.hooks[0], silent_read: " ", delivery: "gritando", first_motion: " " };
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/silent_read/);
    expect(p).toMatch(/delivery es «gritando»/);
    expect(p).toMatch(/first_motion/);
  });

  it("la primera imagen habla como un video de teléfono, salvo lo negado", () => {
    const o = output();
    o.hooks[2] = { ...o.hooks[2], visual_first_3s: "Macro de las patas en cámara lenta." };
    expect(hookProblems(o, facts).join(" ")).toMatch(/lenguaje de estudio \(«Macro»\)/);
    o.hooks[2] = { ...o.hooks[2], visual_first_3s: "Las patas sobre la cerámica, sin cámara lenta." };
    expect(hookProblems(o, facts)).toEqual([]);
  });
});

describe("normalizeHooks: lo que es regla lo arregla el código", () => {
  it("confesión, comentario o experto sin material real: dice qué falta y abre con grabación real", () => {
    const o = output();
    o.hooks[7] = hook({ rank: 8, pattern: "confession", text: "Pensé que era puro cuento, pero…", on_screen: "PENSÉ QUE ERA CUENTO", opening_shot: "selfie_talk" });
    const n = normalizeHooks(o, facts).hooks[7];
    expect(n.needs_real_material).toBe("Un testimonio o un comentario real de un comprador");
    expect(n.opening_shot).toBe("real_footage");
    expect(normalizeHooks(o, { ...facts, hasRealReviews: true }).hooks[7]).toMatchObject({ needs_real_material: null, opening_shot: "selfie_talk" });
    // Bastidores siempre pide grabar.
    o.hooks[9] = { ...o.hooks[9], needs_real_material: null, opening_shot: "pov_hands" };
    expect(normalizeHooks(o, { ...facts, hasRealReviews: true }).hooks[9]).toMatchObject({ needs_real_material: expect.stringMatching(/bodega/), opening_shot: "real_footage" });
  });

  it("lo que pide material real se graba de verdad", () => {
    const o = output();
    o.hooks[9] = { ...o.hooks[9], opening_shot: "pov_hands" };
    expect(normalizeHooks(o, facts).hooks[9].opening_shot).toBe("real_footage");
  });

  it("las citas son opcionales: la que no está o el gancho no usa se quita", () => {
    const o = output();
    o.hooks[8] = { ...o.hooks[8], source_quote: "Se me cae la casa" };
    o.hooks[4] = { ...o.hooks[4], source_quote: "La lavadora se me va hasta la puerta" };
    o.hooks[2] = { ...o.hooks[2], source_quote: "pensé que se iba a ROMPER el piso" };
    const n = normalizeHooks(o, facts);
    expect(n.hooks[8].source_quote).toBeNull();
    expect(n.hooks[4].source_quote).toBeNull();
    expect(n.hooks[2].source_quote).toBe("pensé que se iba a ROMPER el piso");
    expect(hookProblems(normalizeHooks({ ...o, hooks: o.hooks.map((h) => ({ ...h, source_quote: null })) }, { ...facts, buyerVoice: [] }), facts)).toEqual([]);
  });

  it("numera el orden de 1 a 10 sin empates, respetando el del agente", () => {
    const o = output();
    o.hooks[1] = { ...o.hooks[1], rank: 1 };
    o.hooks[5] = { ...o.hooks[5], rank: 40 };
    const ranks = normalizeHooks(o, facts).hooks.map((h) => h.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ranks.slice(0, 2)).toEqual([1, 2]);
    expect(ranks[5]).toBe(10);
  });
});

describe("hooksToPayload y la selección", () => {
  it("guarda los ganchos en su orden (rank) y el recomendado es el primero que se puede usar", () => {
    const o = output();
    // El de grabación real (vaso) queda primero: el recomendado es el siguiente.
    o.hooks = o.hooks.map((h, i) => ({ ...h, rank: i === 1 ? 1 : i === 0 ? 2 : h.rank }));
    const p = hooksToPayload(o);
    expect(p.hooks.map((h) => h.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p.hooks[0].text).toBe("Mira lo que pasa con el vaso.");
    expect(p.recommended_hook).toBe(0);
    expect(p.hook_diagnosis?.archetype).toBe("visible_problem");
    expect(p).not.toHaveProperty("hook_notes");
    expect(p.hooks_error).toBeNull();
    expect(p.hooks_version).toBe(HOOKS_PROMPT_VERSION);
  });

  it("con el crítico, manda su orden y cada gancho guarda lo que dijo", () => {
    const o = output();
    const order = [6, 0, 2, 4, 3, 7, 8, 1, 5, 9];
    const reviews = o.hooks.map((_, hook) => ({ hook, stops: hook === 6 || hook === 0, understood_muted: `gancho ${hook}`, why: hook === 6 ? "Me intriga." : "Otro anuncio más." }));
    const p = hooksToPayload(o, { order, reviews });
    expect(p.hooks[0].text).toBe("Esto existe y casi nadie lo sabe.");
    expect(p.hooks[0]).toMatchObject({ rank: 1, review: { stops: true, understood_muted: "gancho 6", why: "Me intriga." } });
    expect(p.recommended_hook).toBe(0);
    // Fuera solo el de Bastidores (pide grabar la bodega): los de grabación real sirven para los estáticos.
    expect(usableHooks(p).map((u) => u.hook.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("los pasos con IA no usan los que piden material real, los de riesgo alto ni los que rozan la política", () => {
    const p = hooksToPayload(output());
    p.hooks[3] = { ...p.hooks[3], risk: "high" };
    p.hooks[4] = { ...p.hooks[4], policy_ok: false };
    const usable = usableHooks(p).map((u) => u.index);
    expect(usable.slice(0, 3)).toEqual([0, 1, 2]);
    expect(usable).not.toContain(3);
    expect(usable).not.toContain(4);
    expect(usable).not.toContain(9);
    expect(bestHook(p)?.text).toBe("Mi lavadora se fue sola hasta la puerta.");
    expect(hooksForPrompt(p)[0]).toMatchObject({ index: 0, pattern: "Dolor (pain)", on_screen: "¿TU LAVADORA CAMINA?" });
  });

  it("el comerciante elige el recomendado y después sigue el orden", () => {
    const p = { ...hooksToPayload(output()), recommended_hook: 6 };
    expect(usableHooks(p).map((u) => u.index).slice(0, 3)).toEqual([6, 0, 1]);
  });

  it("los de antes siguen su top y sus puntajes", () => {
    const old = {
      hooks: [
        { text: "Uno", visual_first_3s: "a", policy_ok: true, scores: { salience: 3, relevance: 3, credibility: 3, verifiability: 3 } },
        { text: "Dos", visual_first_3s: "b", policy_ok: true, scores: { salience: 5, relevance: 5, credibility: 5, verifiability: 5 } },
        { text: "Tres", visual_first_3s: "c", policy_ok: true, scores: { salience: 4, relevance: 4, credibility: 4, verifiability: 4 } },
      ] as AngleHook[],
      recommended_hook: 2,
      hook_top: [{ hook: 2, why: "", variant: { changes: "spoken", text: "x" } }],
    };
    expect(usableHooks(old).map((u) => u.index)).toEqual([2, 1, 0]);
  });

  it("el video con IA y la mascota no usan los de grabación real", () => {
    const p = hooksToPayload(output());
    const video = usableHooks(p, "ai_video").map((u) => u.index);
    expect(video).not.toContain(1);
    expect(video).not.toContain(5);
    expect(video).toContain(3);
    expect(usableHooks(p, "mascot").map((u) => u.index)).toEqual(video);
    expect(hooksForPrompt(p, "ai_video")[0]).toMatchObject({ index: 0, opening_shot: "problem_scene", first_motion: "La lavadora tiembla y avanza unos centímetros.", delivery: expect.stringMatching(/^Sorpresa \(/) });
    // La mascota recibe el gancho y cómo se dice, sin la toma de la persona: lo dice a su manera.
    expect(hooksForPrompt(p, "mascot")[0]).toMatchObject({ index: 0, spoken: "Mi lavadora se fue sola hasta la puerta.", delivery: expect.stringMatching(/^Sorpresa/) });
    expect(hooksForPrompt(p, "mascot")[0]).not.toHaveProperty("opening_shot");
  });

  it("los ganchos de hasta la versión 5 traen su versión de mascota y se sigue usando", () => {
    const p = hooksToPayload(output());
    p.hooks[0] = { ...p.hooks[0], mascot: { text: "Soy la lavadora que camina sola.", on_screen: "YO NO ME QUEDO QUIETA", scene: "La lavadora con cara avanza temblando.", first_motion: "Tiembla." } };
    expect(hooksForPrompt(p, "mascot")[0]).toMatchObject({ index: 0, spoken: "Soy la lavadora que camina sola.", on_screen: "YO NO ME QUEDO QUIETA", scene: "La lavadora con cara avanza temblando." });
  });

  it("un gancho de antes abre con la persona", () => {
    const old = { hooks: [{ text: "Dos", visual_first_3s: "Algo", policy_ok: true }] as AngleHook[], recommended_hook: 0 };
    expect(hooksForPrompt(old, "ai_video")[0]).toMatchObject({ opening_shot: "selfie_talk" });
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

describe("prompt del agente de ganchos (v6)", () => {
  const payload = { core_message: "Quieta y en silencio", psychological_lever: "Pérdida", aida_summary: { attention: "a", interest: "b", desire: "c", action: "d" }, proof_to_show: [], visual_concepts: [], compliance_flags: [], details: {}, hooks: [], recommended_hook: 0 } as unknown as AngleBriefPayload;
  const brief = {
    product_name: "Almohadillas antivibración",
    what_it_does: "Frenan la vibración de la lavadora.",
    how_it_works: "Goma bajo cada pata.",
    key_facts: [{ label: "Incluye", value: "4 almohadillas" }],
    problem_solved: "La lavadora camina",
    proof: { real_reviews: ["Ya no se mueve"], real_expert: null },
  } as unknown as ProductBrief;
  const angle = { slot: 1 as const, frame: "unique_mechanism" as const, title: "No es la lavadora", pain_or_desire: "Ruido", segment: "", promise: "", trigger_moment: "", competition: "", hook: "Tu lavadora no está rota: está suelta.", speaks_to: "buyer" as const, tone: "humor" };
  const ctx = { brief, avatar: AVATAR, pricing, angle: angleForPrompt(angle, payload), others: ["«Oferta»"], hasImage: true };

  it("el system es corto, solo depende del mercado y pide los largos con margen", () => {
    const sys = hooksSystem(CL);
    expect(sys).toBe(hooksSystem(CL));
    expect(sys.split("\n").length).toBeLessThan(30);
    expect(sys).toContain("español neutro con tuteo");
    expect(sys).toContain("$19.990");
    expect(sys).toContain(`máximo ${SPOKEN_PROMPT_WORDS} palabras`);
    expect(sys).toContain(`máximo ${ON_SCREEN_PROMPT_WORDS}`);
    expect(sys).toContain("Hablarle de lo que hace o de un ser querido");
    expect(sys).toContain("necesita grabación real");
    expect(sys).not.toMatch(/\bquerés\b|\bllevá\b|\bcomprá\b|voseo \(/);
    // Sin la biblioteca de patrones, sin cuotas y sin la mascota.
    for (const p of HOOK_PATTERNS) expect(sys).not.toContain(`${p} — `);
    expect(sys).not.toMatch(/al menos \d+ patrones|mascota|MATERIA PRIMA|puntúa/i);
    expect(sys).not.toContain("Quieta y en silencio");
  });

  it("el contexto es texto corto: sin la ficha ni el cliente ideal en JSON", () => {
    const u = hooksContextText(ctx);
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary|proof)"\s*:/);
    expect(u).not.toContain("{");
    expect(u).toContain("PRODUCTO: Almohadillas antivibración");
    expect(u).toContain("- Incluye: 4 almohadillas");
    expect(u).toContain("PRUEBAS REALES: sin experto; 1 reseñas");
    expect(u).toContain(`QUIÉN COMPRA, SEGÚN EL COMERCIANTE: ${AVATAR.summary}`);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("Ángulo 1: «No es la lavadora»");
    expect(u).toContain("«Tu lavadora no está rota: está suelta.»");
    expect(u).toContain("- Idea central: Quieta y en silencio");
    expect(u).toContain("«Oferta»");
    // Solo cinco frases de quien compra, no el cliente ideal entero.
    expect(hooksVoice(ctx)).toHaveLength(5);
    for (const v of hooksVoice(ctx)) expect(u).toContain(`«${v}»`);
    expect(u).not.toContain(AVATAR.emotions.fears);
    expect(u).not.toContain(AVATAR.formula);
    expect(hooksContextText(ctx)).toBe(hooksContextText(ctx));
  });

  it("la pregunta: al menos 3 son el gancho del ángulo dicho para video", () => {
    expect(hooksAsk(true)).toMatch(/^Escribe 10 ganchos para video que detengan el scroll[\s\S]*al menos 3 son el gancho del ángulo dicho para video; los demás, otras entradas a la misma idea/);
    expect(hooksAsk(false)).toContain("la idea central del ángulo");
    expect(hooksUser(ctx)).toContain(hooksAsk(true));
    expect(hooksUser({ ...ctx, angle: angleForPrompt({ ...angle, hook: undefined }, payload) })).toContain(hooksAsk(false));
    expect(hooksTail(true, ["Trae 9."], ["Mira esto."])).toMatch(/YA TIENE[\s\S]*Mira esto[\s\S]*Trae 9/);
  });

  it("los patrones que piden material real lo dicen", () => {
    expect(Object.entries(PATTERN_DEFS).filter(([, d]) => d.needsReal).map(([p]) => p)).toEqual(["confession", "authority", "behind_scenes", "comment_reply"]);
  });

  it("el esquema se queda con lo que alguien lee", () => {
    const schema = toJSONSchema(hooksOutputSchema) as unknown as { properties: { hooks: { items: { properties: object } }; diagnosis: { properties: object } } };
    expect(Object.keys(schema.properties.hooks.items.properties).sort()).toEqual(
      ["text", "follow_up", "on_screen", "silent_read", "visual_first_3s", "opening_shot", "first_motion", "delivery", "pattern", "source_quote", "rank", "risk", "risk_reason", "needs_real_material", "policy_ok"].sort(),
    );
    expect(Object.keys(schema.properties.diagnosis.properties).sort()).toEqual(["archetype", "main_objection", "policy_risk"]);
    expect(schema).not.toHaveProperty("properties.production_notes");
  });

  // La API rechaza gramáticas muy grandes (400 «compiled grammar is too large»). El paso del cliente
  // ideal funciona en producción: el de los ganchos no puede ser más grande (mismo criterio que Ángulos).
  it("no es más grande que el del cliente ideal", () => {
    const size = (schema: unknown) => {
      let n = 0;
      const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        if (o.type === "object") n += 1 + Object.keys((o.properties as object) ?? {}).length;
        if (Array.isArray(o.enum)) n += o.enum.length;
        for (const v of Object.values(o)) walk(v);
      };
      walk(schema);
      return n;
    };
    expect(size(toJSONSchema(hooksOutputSchema))).toBeLessThanOrEqual(size(toJSONSchema(avatarStepSchema)));
  });

  it("la cola de la reescritura dice qué reemplazar y qué conservar", () => {
    const tail = hooksTail(true, [], [], { weak: ["«Todos se rieron.» / «SE RÍE TARDE»: sin sonido se entiende «alguien se ríe». Otro anuncio más."], keep: ["Mi papá finge que escucha."] });
    expect(tail).toMatch(/NO DETIENE EL SCROLL[\s\S]*Todos se rieron[\s\S]*Conserva tal cual[\s\S]*Mi papá finge que escucha/);
  });
});

describe("crítico de ganchos", () => {
  const o = output();
  const review = (over: Partial<HookCriticOutput> = {}): HookCriticOutput => ({
    reviews: o.hooks.map((_, hook) => ({ hook, understood_muted: `gancho ${hook}`, stops: hook < 3, why: hook < 3 ? "Quiero saber qué pasó." : "Es una característica." })),
    order: [2, 0, 1, 3, 4, 5, 6, 7, 8, 9],
    ...over,
  });

  it("ve los ganchos como se ven: sin mecanismo, puntajes ni orden del autor", () => {
    const u = hookCriticUser({ avatar: AVATAR, speaksTo: "quien compra", hooks: o.hooks });
    expect(u).toContain("En pantalla: «¿TU LAVADORA CAMINA?»");
    expect(u).toContain("Se dice: «Pensé que se iba a romper el piso. Era otra cosa.»");
    expect(u).toContain("El problema en su lugar.");
    expect(u).not.toContain("Aversión a la pérdida");
    expect(u).not.toMatch(/rank|salience/);
    expect(hookCriticSystem(CL)).toBe(hookCriticSystem(CL));
    expect(hookCriticSystem(CL)).toContain("No juzgas las políticas");
  });

  it("pide un review y un lugar por gancho", () => {
    expect(hookCriticProblems(review(), 10)).toEqual([]);
    const p = hookCriticProblems(review({ order: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8], reviews: review().reviews.slice(0, 9) }), 10).join(" ");
    expect(p).toMatch(/un review por gancho/);
    expect(p).toMatch(/order tiene que traer todos/);
  });

  it("cuenta cuántos detiene y arma la reescritura", () => {
    const r = toHooksReview(review());
    expect(stopsCount(r)).toBe(3);
    const c = critiqueFor(o.hooks, r);
    expect(c.keep).toEqual([o.hooks[0].text, o.hooks[1].text, o.hooks[2].text]);
    expect(c.weak).toHaveLength(7);
    expect(c.weak[0]).toMatch(/«Un técnico te cobra más por visita\.» \/ «4 POR \$24\.990»: sin sonido se entiende «gancho 3»\. Es una característica\./);
  });

  it("el esquema compila y es chico", () => {
    expect(toJSONSchema(hookCriticSchema)).toHaveProperty("properties.order");
  });
});
