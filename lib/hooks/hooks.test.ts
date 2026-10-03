import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod/v4";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import { avatarStepSchema, type ProductBrief } from "@/lib/ai/schemas";
import { angleForPrompt } from "@/lib/angles/approved";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { HOOK_PATTERNS, ON_SCREEN_PROMPT_WORDS, PATTERN_DEFS, SPOKEN_PROMPT_WORDS } from "./catalog";
import { critiqueFor, hookCriticProblems, hookCriticSchema, hookCriticSystem, hookCriticUser, stopsCount, toHooksReview, type HookCriticOutput } from "./critic";
import { hooksContextText, hooksSystem, hooksTail, hooksUser, rawMaterial } from "./prompts";
import { hookProblems, hooksOutputSchema, hooksToPayload, hookTextOk, wordCount, type AngleHook, type HooksOutput } from "./schemas";
import { bestHook, hooksForPrompt, isUsable, usableHooks } from "./select";

const CL = { countryCode: "CL", currency: "CLP", language: "es", timezone: "America/Santiago" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
// MATERIA PRIMA del ejemplo: lo que dice el comprador.
const RAW = ["La lavadora se me va hasta la puerta", "Pensé que se iba a romper el piso", "Suena como si fuera a despegar"];
const facts = { pricing, hasRealReviews: false, hasRealExpert: false, rawMaterial: RAW };

const hook = (over: Partial<HooksOutput["hooks"][number]> = {}): HooksOutput["hooks"][number] => ({
  pattern: "pain",
  mechanism: "Aversión a la pérdida",
  text: "Esta vibración está dañando tu lavadora.",
  follow_up: null,
  on_screen: "¿TU LAVADORA CAMINA?",
  visual_first_3s: "Lavadora centrifugando y temblando, plano medio.",
  silent_read: "Una lavadora que se mueve sola.",
  source_quote: null,
  delivery: "surprised",
  scores: { salience: 5, relevance: 5, tension: 4, credibility: 4 },
  promises_only_what_arrives: true,
  rank: 1,
  risk: "low",
  risk_reason: "Daño a un objeto",
  needs_real_material: null,
  policy_ok: true,
  opening_shot: "problem_scene",
  first_motion: "La lavadora tiembla y avanza unos centímetros.",
  mascot: null,
  ...over,
});

// El ejemplo resuelto del agente (almohadillas antivibración), completado a 10 en 6 patrones.
const output = (): HooksOutput => ({
  diagnosis: { archetype: "visible_problem", secondary_archetype: "protection", core_pain: "La lavadora se mueve y suena horrible", main_objection: "¿De verdad funciona?", policy_risk: "low" },
  hooks: [
    hook({ rank: 1, text: "Mi lavadora se fue sola hasta la puerta.", source_quote: "La lavadora se me va hasta la puerta", mascot: { text: "Soy la lavadora que camina sola.", on_screen: "YO NO ME QUEDO QUIETA", scene: "La lavadora con cara avanza temblando por la cocina mientras su dueña la persigue.", first_motion: "La lavadora tiembla y avanza." } }),
    hook({ rank: 2, pattern: "demo", mechanism: "Ciclo abierto", text: "Mira lo que pasa con el vaso.", on_screen: "PRUEBA DEL VASO", visual_first_3s: "Vaso de agua sobre la lavadora vibrando; con las almohadillas, quieto.", opening_shot: "real_footage" }),
    hook({ rank: 3, text: "Pensé que se iba a romper el piso.", follow_up: "Era otra cosa.", source_quote: "Pensé que se iba a romper el piso", on_screen: "NO ES LA LAVADORA", visual_first_3s: "Las patas deslizándose sobre la cerámica.", mascot: { text: "Me culpan a mí, pero el piso resbala.", on_screen: "NO ES MI CULPA", scene: "La lavadora ofendida, de brazos cruzados, resbala sobre la cerámica.", first_motion: "La lavadora tiembla y avanza." } }),
    hook({ rank: 4, pattern: "offer", mechanism: "Anclaje", text: "Un técnico te cobra más por visita.", on_screen: "4 POR $24.990", visual_first_3s: "La mano coloca las 4 almohadillas.", opening_shot: "pov_hands" }),
    hook({ rank: 5, pattern: "contrarian", mechanism: "Expectativa rota", text: "No cambies tu lavadora todavía.", on_screen: "ANTES DE COMPRAR OTRA", visual_first_3s: "Una mujer a la cámara frontal levanta la mano para frenar.", opening_shot: "selfie_talk", mascot: { text: "No me cambies todavía, dueña.", on_screen: "ANTES DE COMPRAR OTRA", scene: "La lavadora asustada mira un folleto de lavadoras nuevas.", first_motion: "La lavadora tiembla y avanza." } }),
    hook({ rank: 6, pattern: "demo", mechanism: "Satisfacción visual", text: "Tienes que ver esto.", on_screen: "SIN ALMOHADILLAS VS CON", visual_first_3s: "Pantalla dividida: dos lavadoras centrifugando.", opening_shot: "real_footage" }),
    hook({ rank: 7, pattern: "curiosity", mechanism: "Brecha de información", text: "Esto existe y casi nadie lo sabe.", on_screen: "4 PIEZAS, CERO RUIDO", visual_first_3s: "La mano saca las almohadillas de la bolsa junto a la lavadora.", opening_shot: "pov_hands" }),
    hook({ rank: 8, pattern: "contrarian", mechanism: "Inoculación", text: "No te creas todo lo que ves en TikTok.", follow_up: "Yo la probé con un vaso de agua.", on_screen: "¿FUNCIONA DE VERDAD?", visual_first_3s: "Mujer cruzada de brazos frente a la lavadora.", opening_shot: "selfie_talk" }),
    hook({ rank: 9, pattern: "fear", mechanism: "Detección de amenazas", text: "Suena como si fuera a despegar.", follow_up: "Y la manguera se tensa.", source_quote: "Suena como si fuera a despegar", on_screen: "OJO CON LA MANGUERA", visual_first_3s: "La manguera tensa detrás de la lavadora, el teléfono asomado por el costado." }),
    hook({ rank: 10, pattern: "behind_scenes", mechanism: "Credibilidad", text: "Acá preparamos los pedidos que salen hoy.", on_screen: "PEDIDOS DE HOY", visual_first_3s: "Mesa con cajas y las almohadillas.", needs_real_material: "Grabar la bodega con los pedidos", opening_shot: "real_footage" }),
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
    o.hooks[4] = hook({ pattern: "contrarian", text: "No compres otra lavadora.", scores: { salience: 4, relevance: 4, tension: 2, credibility: 4 } });
    expect(hookProblems(o, facts).join(" ")).toMatch(/2 en tension: descártalo/);
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
    o.hooks[7] = hook({ rank: 8, pattern: "confession", text: "Pensé que era puro cuento, pero…", on_screen: "PENSÉ QUE ERA CUENTO" });
    expect(hookProblems(o, facts).join(" ")).toMatch(/es de Confesión y la ficha no trae ese material real/);
    expect(hookProblems(o, { ...facts, hasRealReviews: true })).toEqual([]);
    o.hooks[9] = hook({ pattern: "behind_scenes", text: "Acá preparamos los pedidos de hoy.", on_screen: "PEDIDOS DE HOY", needs_real_material: null });
    expect(hookProblems(o, { ...facts, hasRealReviews: true }).join(" ")).toMatch(/Bastidores/);
  });

  it("un lugar por gancho, de 1 a 10 y sin empates", () => {
    const o = output();
    o.hooks[1] = { ...o.hooks[1], rank: 1 };
    expect(hookProblems(o, facts).join(" ")).toMatch(/rank tiene que ir de 1 a 10/);
  });

  it("pide lo que se entiende sin sonido, un delivery válido y que prometa lo que llega", () => {
    const o = output();
    o.hooks[0] = { ...o.hooks[0], silent_read: " ", delivery: "gritando", promises_only_what_arrives: false };
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/silent_read/);
    expect(p).toMatch(/delivery es «gritando»/);
    expect(p).toMatch(/no ve al abrir el paquete/);
  });

  it("al menos 3 parten de MATERIA PRIMA, con la cita textual y sus palabras", () => {
    const o = output();
    o.hooks[8] = { ...o.hooks[8], source_quote: "Se me cae la casa" };
    let p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/«Se me cae la casa» no está en MATERIA PRIMA/);
    expect(p).toMatch(/Solo 2 ganchos parten de una frase de MATERIA PRIMA/);
    o.hooks[8] = { ...o.hooks[8], source_quote: "La lavadora se me va hasta la puerta" };
    p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/dice partir de «La lavadora se me va hasta la puerta», pero no usa sus palabras/);
    // Sin tildes ni mayúsculas también vale; y sin MATERIA PRIMA no se piden.
    o.hooks[8] = { ...o.hooks[8], source_quote: "suena como si fuera a DESPEGAR" };
    expect(hookProblems(o, facts)).toEqual([]);
    expect(hookProblems({ ...output(), hooks: output().hooks.map((h) => ({ ...h, source_quote: null })) }, { ...facts, rawMaterial: [] })).toEqual([]);
  });
});

describe("hookProblems: la primera toma y la mascota", () => {
  it("lo que pide material real se graba de verdad", () => {
    const o = output();
    o.hooks[9] = { ...o.hooks[9], opening_shot: "pov_hands" };
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/El gancho 10: pide material real: su opening_shot es real_footage/);
    expect(p).toMatch(/Bastidores: se graba de verdad/);
  });

  it("la primera toma habla como un video de teléfono, salvo lo negado", () => {
    const o = output();
    o.hooks[2] = { ...o.hooks[2], visual_first_3s: "Macro de las patas en cámara lenta." };
    expect(hookProblems(o, facts).join(" ")).toMatch(/lenguaje de estudio \(«Macro»\)/);
    o.hooks[2] = { ...o.hooks[2], visual_first_3s: "Las patas sobre la cerámica, sin cámara lenta." };
    expect(hookProblems(o, facts)).toEqual([]);
  });

  it("pide qué se mueve en el cuadro 0", () => {
    const o = output();
    o.hooks[3] = { ...o.hooks[3], first_motion: " " };
    expect(hookProblems(o, facts).join(" ")).toMatch(/first_motion/);
  });

  it("al menos 3 ganchos con versión de mascota en 2 patrones", () => {
    const o = output();
    o.hooks[4] = { ...o.hooks[4], mascot: null };
    expect(hookProblems(o, facts).join(" ")).toMatch(/2 ganchos con versión de mascota en 1 patrones/);
  });

  it("la mascota solo en los patrones que encajan, con sus reglas", () => {
    const o = output();
    o.hooks[3] = { ...o.hooks[3], pattern: "behind_scenes", opening_shot: "real_footage", needs_real_material: "Grabar la bodega", mascot: o.hooks[0].mascot };
    o.hooks[0] = { ...o.hooks[0], mascot: { text: "Tus pies me esconden en zapatos cerrados.", on_screen: "PAGAS AL RECIBIR", scene: "La uña con un cuello largo asoma del zapato.", first_motion: "Se asoma." } };
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/El gancho 4: es de Bastidores: no encaja en la mascota/);
    expect(p).toMatch(/versión de mascota «Tus pies me esconden en zapatos cerrados\.» le atribuye/);
    expect(p).toMatch(/versión de mascota habla del pago contra entrega/);
    expect(p).toMatch(/algo sexual \(«cuello»\)/);
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
    expect(p.hooks_error).toBeNull();
    expect(p.hooks_version).toBe(4);
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

  it("el video con IA no usa los de grabación real; la mascota, solo los que tienen su versión", () => {
    const p = hooksToPayload(output());
    const video = usableHooks(p, "ai_video").map((u) => u.index);
    expect(video).not.toContain(1);
    expect(video).not.toContain(5);
    expect(video).toContain(3);
    expect(usableHooks(p, "mascot").map((u) => u.index)).toEqual([0, 2, 4]);
    expect(hooksForPrompt(p, "ai_video")[0]).toMatchObject({ index: 0, opening_shot: "problem_scene", first_motion: "La lavadora tiembla y avanza unos centímetros.", delivery: expect.stringMatching(/^Sorpresa \(/) });
    expect(hooksForPrompt(p, "mascot")[0]).toMatchObject({ index: 0, spoken: "Soy la lavadora que camina sola.", on_screen: "YO NO ME QUEDO QUIETA" });
    expect(hooksForPrompt(p, "mascot")[0]).toHaveProperty("scene");
  });

  it("un gancho de antes abre con la persona", () => {
    const old = { hooks: [{ text: "Dos", visual_first_3s: "Algo", policy_ok: true }] as AngleHook[], recommended_hook: 0 };
    expect(hooksForPrompt(old, "ai_video")[0]).toMatchObject({ opening_shot: "selfie_talk" });
    expect(usableHooks(old, "mascot")).toEqual([]);
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
    expect(sys).toContain("LA PRIMERA TOMA (opening_shot)");
    expect(sys).toContain("LA VERSIÓN DE MASCOTA (mascot)");
    expect(sys).toContain("real_footage (muestra el efecto");
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

  it("valida en código lo que no es enum", () => {
    const o = output();
    o.diagnosis = { ...o.diagnosis, secondary_archetype: "otro" };
    const p = hookProblems(o, facts).join(" ");
    expect(p).toMatch(/secondary_archetype es «otro»/);
  });
});

describe("prompt v4: detener el scroll", () => {
  it("el system explica la tensión, el problema nombrado y deja los modismos solo en una cita", () => {
    const sys = hooksSystem(CL);
    expect(sys).toContain("LO QUE DETIENE EL SCROLL");
    expect(sys).toContain("La PRIMERA frase del hablado lleva la tensión");
    expect(sys).toContain("protege a QUIEN MIRA, no a sus seres queridos");
    expect(sys).toContain("modismos del país solo dentro de una frase textual de MATERIA PRIMA");
    expect(sys).toContain("es material, no molde");
    expect(sys).not.toContain("al menos 3 de los 10 son esa misma idea");
    expect(sys).toContain("rank");
  });

  it("MATERIA PRIMA trae lo que dice el comprador, la apertura del ángulo y las reseñas, sin repetir", () => {
    const payload = { core_message: "", psychological_lever: "", aida_summary: { attention: "Se fue a lavar la loza", interest: "Antes era el que más hablaba", desire: "", action: "" }, proof_to_show: [], visual_concepts: [], compliance_flags: [], details: {}, hooks: [], recommended_hook: 0 } as unknown as AngleBriefPayload;
    const ctx = {
      brief: { product_name: "Amplificador", proof: { real_reviews: ["Mi mamá lo usa sin reclamar"] } } as unknown as ProductBrief,
      avatar: { ...AVATAR, voice_of_customer: ["Dice ¿ah? como diez veces", "Dice ¿ah? como diez veces"] },
      angle: angleForPrompt({ slot: 1, frame: "age_identity", title: "El almuerzo", pain_or_desire: "", segment: "", promise: "", trigger_moment: "", competition: "", aida: { attention: "Se fue a lavar la loza", interest: "", desire: "", action: "" } }, payload),
    };
    const raw = rawMaterial(ctx);
    expect(raw.filter((t) => t === "Dice ¿ah? como diez veces")).toHaveLength(1);
    expect(raw.filter((t) => t === "Se fue a lavar la loza")).toHaveLength(1);
    expect(raw).toContain("Antes era el que más hablaba");
    expect(raw).toContain("Mi mamá lo usa sin reclamar");
  });

  it("la cola de la reescritura dice qué reemplazar y qué conservar", () => {
    const tail = hooksTail([], [], { weak: ["«Todos se rieron.» / «SE RÍE TARDE»: sin sonido se entiende «alguien se ríe». Otro anuncio más."], keep: ["Mi papá finge que escucha."] });
    expect(tail).toMatch(/NO DETIENE EL SCROLL[\s\S]*Todos se rieron[\s\S]*Conserva tal cual[\s\S]*Mi papá finge que escucha/);
  });

  it("el esquema ya no pide top ni variantes", () => {
    expect(toJSONSchema(hooksOutputSchema)).not.toHaveProperty("properties.top");
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
