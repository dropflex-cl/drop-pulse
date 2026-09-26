import { describe, expect, it } from "vitest";
import type { PricingPlan } from "@/lib/pricing/plan";
import { A_ROLL_ENDPOINT, B_ROLL_ENDPOINT, KEYFRAME_ENDPOINT, montageFile } from "./catalog";
import { scriptCost, seedanceCostUsd } from "./cost";
import { DEFAULT_ACCENT, PackageNotReady, buildPackage, captionAccent, videoLabel } from "./package";
import { aRollRequest, bRollRequest, keyframeRefs, keyframeRequest, voiceBlock } from "./render";
import { applyScriptEdit, changedLines, keyframeQaVerdict, scriptProblems, words, type UgcScript } from "./schemas";

// Deep Collagen (POC 2026-09-26, variante E, ángulo 3): el guion que el usuario aprobó.
const pricing = {
  currency: "CLP",
  salePrice: 27990,
  compareAtPrice: 36990,
  packs: [
    { units: 1, price: 27990, perUnitPrice: 27990, savings: 0 },
    { units: 2, price: 41990, perUnitPrice: 20995, savings: 13990 },
    { units: 3, price: 55990, perUnitPrice: 18663.33, savings: 27980 },
  ],
} as unknown as PricingPlan;

const script = (): UgcScript => ({
  format_fit: { recommended: "ugc_ai", why: "El problema se muestra en el espejo y la solución es un gesto." },
  persona: "a Latin American woman around 42, warm and relatable",
  character: { look: "dark-brown hair clipped up, natural skin with fine lines", wardrobe: "a light gray bathrobe", setting: "a small home bathroom, morning light" },
  hook_why: "Le habla de lo que hace cada mañana.",
  keyframes: [
    { key: "K1", uses_character: true, uses_product: false, one_hand: false, prompt: "The person at the bathroom mirror dabbing foundation with a sponge, looking at the camera." },
    { key: "K2", uses_character: true, uses_product: true, one_hand: true, prompt: "The person by the window holding the product next to her cheek." },
    { key: "K3", uses_character: false, uses_product: false, one_hand: false, prompt: "A round wall clock showing 7:12 in a bathroom." },
    { key: "K4", uses_character: false, uses_product: true, one_hand: false, prompt: "Macro of the product dropper releasing drops onto fingertips." },
  ],
  a_roll: [
    { key: "A1", keyframe: "K1", seconds: 6, line: "¿Te maquillas en siete minutos antes del trabajo? Entonces seguro cometes estos tres errores.", delivery: "Rises on siete minutos.", acting: "Leans in, playful.", motion: "Handheld selfie." },
    { key: "A2", keyframe: "K1", seconds: 6, line: "Uno: base sobre piel tirante. ¡A mí, a media mañana, se me marcaba todo en las líneas!", delivery: "Funny confession.", acting: "Points under her eye.", motion: "Closer framing." },
    { key: "A3", keyframe: "K1", seconds: 6, line: "Dos: nos olvidamos del cuello. Y tres: creemos que la crema sola ya es rutina.", delivery: "Tone of right?", acting: "Counts on fingers.", motion: "Handheld." },
    { key: "A4", keyframe: "K2", seconds: 7, line: "¿Lo que cambié? Tres gotas en rostro y cuello, antes de la crema y la base. ¡Veinte segundos!", delivery: "Like a secret.", acting: "Brings the bottle closer.", motion: "By the window." },
    { key: "A5", keyframe: "K2", seconds: 5, line: "Te dura hasta mes y medio, ¡y lo pagas cuando te llega!", delivery: "Good news.", acting: "Winks.", motion: "Handheld." },
  ],
  b_roll: [
    { key: "B1", keyframe: "K3", anchor: "minutos", cut_s: 1.2, motion: "The second hand ticks, quick push-in." },
    { key: "B2", keyframe: "K4", anchor: "gotas", cut_s: 1.8, motion: "Three drops fall slowly." },
  ],
  text_beats: [
    { anchor: "minutos", until: null, text: "¿MAQUILLAJE EN 7 MIN?" },
    { anchor: "errores", until: null, text: "3 ERRORES" },
    { anchor: "dura", until: null, text: "Lleva 3, paga 2 · $18.663 c/u" },
  ],
  end_card: { title: "Deep Collagen", subtitle: "Pagas al recibir", cta: "Comprar", small_print: ["Prueba primero en una zona pequeña."] },
  compliance_notes: [],
});

describe("scriptProblems", () => {
  it("acepta el guion de la POC", () => {
    expect(scriptProblems(script(), pricing)).toEqual([]);
  });

  it("no deja decir precios ni números en dígitos", () => {
    const s = script();
    s.a_roll[4].line = "Tres por cincuenta y cinco mil novecientos noventa.";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/monto/);
    s.a_roll[4].line = "Llévate 3 y paga al recibir.";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/monto/);
  });

  it("controla el largo por segundo y el total", () => {
    const s = script();
    s.a_roll[4].line = "Te dura hasta mes y medio y lo pagas cuando te llega a la casa sin adelantar nada de nada hoy";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/palabras para 5 s/);
    const long = script();
    long.a_roll = long.a_roll.map((a) => ({ ...a, seconds: 8 }));
    expect(scriptProblems(long, pricing).join(" ")).toMatch(/suman 40 s/);
  });

  it("marca las palabras que la voz pronuncia mal", () => {
    const s = script();
    s.a_roll[4].line = "Rinde hasta mes y medio, ¡y lo pagas cuando te llega!";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/rinde/);
  });

  it("no deja hablar de la piel de quien mira en segunda persona", () => {
    const s = script();
    s.a_roll[1].line = "Uno: tu piel se ve tirante a media mañana.";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/segunda persona/);
  });

  it("la persona de IA no dice su edad", () => {
    const s = script();
    s.a_roll[1].line = "Tengo cuarenta y dos y la base se me metía en las líneas.";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/edad a la persona de IA/);
    s.a_roll[1].line = "A mis 42 la base se me metía en las líneas.";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/edad a la persona de IA/);
  });

  it("exige anclas que se digan y claves en orden", () => {
    const s = script();
    s.b_roll[0].anchor = "reloj";
    s.text_beats[1].anchor = "fallas";
    s.b_roll[1].key = "B7";
    const p = scriptProblems(s, pricing).join(" ");
    expect(p).toMatch(/«reloj», que nadie dice/);
    expect(p).toMatch(/«fallas», que nadie dice/);
    expect(p).toMatch(/debe llamarse B2/);
  });

  it("exige K1 como personaje solo y que cada imagen clave se use", () => {
    const s = script();
    s.keyframes[0].uses_product = true;
    s.keyframes.push({ key: "K5", uses_character: false, uses_product: false, one_hand: false, prompt: "unused" });
    const p = scriptProblems(s, pricing).join(" ");
    expect(p).toMatch(/K1 es el personaje solo/);
    expect(p).toMatch(/K5 no la usa ninguna toma/);
  });

  it("controla los montos de los textos en pantalla", () => {
    const s = script();
    s.text_beats[2].text = "Hoy $9.990";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/monto/);
  });
});

describe("edición", () => {
  it("cambia líneas y textos sin tocar la dirección, y dice qué tomas rehacer", () => {
    const before = script();
    const after = applyScriptEdit(before, {
      a_roll: [{ key: "A5", line: "Te dura hasta mes y medio, ¡y pagas al recibir!", delivery: "" }],
      text_beats: [{ text: "¿MAQUILLAJE EN 7 MINUTOS?" }],
      end_card: { title: "Deep Collagen", subtitle: "Pagas al recibir", cta: "Comprar" },
    });
    expect(after.a_roll[4].line).toMatch(/pagas al recibir/);
    expect(after.a_roll[4].delivery).toBe("Good news.");
    expect(after.text_beats[0].text).toBe("¿MAQUILLAJE EN 7 MINUTOS?");
    expect(after.keyframes).toEqual(before.keyframes);
    expect(changedLines(before, after)).toEqual(["A5"]);
  });

  it("words normaliza tildes y signos", () => {
    expect(words("¿Lo que cambié? ¡Veinte segundos!")).toEqual(["lo", "que", "cambie", "veinte", "segundos"]);
  });
});

describe("render", () => {
  it("K1 va sin referencias; el resto con el personaje primero y el producto después", () => {
    const s = script();
    expect(keyframeRefs(s.keyframes[0], "K1")).toEqual([]);
    expect(keyframeRefs(s.keyframes[1], "K1")).toEqual(["character", "product"]);
    expect(keyframeRefs(s.keyframes[3], "K1")).toEqual(["product"]);
    const k2 = keyframeRequest(s.keyframes[1], s, "K1");
    expect(k2.endpoint).toBe(KEYFRAME_ENDPOINT);
    expect(k2.input).toMatchObject({ aspect_ratio: "9:16", enhance_prompt: false, quality: "low" });
    expect(String(k2.input.prompt)).toMatch(/first reference image \(same face/);
    expect(String(k2.input.prompt)).toMatch(/second reference image/);
    expect(String(k2.input.prompt)).toMatch(/Only one hand/);
    expect(String(keyframeRequest(s.keyframes[0], s, "K1").input.prompt)).toMatch(/light gray bathrobe/);
  });

  it("la toma hablada lleva la línea exacta, su entrega y la voz de la POC", () => {
    const a = script().a_roll[3];
    const r = aRollRequest(a, "es", true);
    expect(r.endpoint).toBe(A_ROLL_ENDPOINT);
    expect(r.input).toMatchObject({ duration: 7, resolution: "720p", generate_audio: true });
    expect(String(r.input.prompt)).toContain(`saying exactly: «${a.line}»`);
    expect(String(r.input.prompt)).toContain("Like a secret.");
    expect(String(r.input.prompt)).toContain("neutral Latin American Spanish");
    expect(voiceBlock("pt-BR")).toContain("Brazilian Portuguese");
  });

  it("el B-roll es Kling de 5 s sin audio", () => {
    const r = bRollRequest(script().b_roll[1], true);
    expect(r.endpoint).toBe(B_ROLL_ENDPOINT);
    expect(r.input).toMatchObject({ duration: 5 });
    expect(String(r.input.negative_prompt)).toMatch(/extra hands/);
  });
});

describe("costos", () => {
  it("Seedance 2.0 a 720p 9:16 ≈ US$0,30 por segundo", () => {
    expect(seedanceCostUsd(1)).toBeCloseTo(0.3024, 3);
    const c = scriptCost(script());
    expect(c.keyframes).toBeCloseTo(0.4, 5);
    expect(c.clips).toBeCloseTo(30 * 0.3024 + 2 * 0.179, 2);
  });
});

describe("paquete de montaje", () => {
  const base = {
    product: { id: "p1", title: "Deep Collagen" },
    angle: { slot: 3, title: "Cuando la base se mete en las líneas" },
    language: "es",
    accentColor: null,
    endCardImageUrl: "https://x/base.jpg",
    expiresAt: "2026-09-27T00:00:00Z",
  };
  const urls = new Map(["A1", "A2", "A3", "A4", "A5", "B1", "B2"].map((k) => [k, `https://x/${k}.mp4`]));

  it("lleva cada clip con su URL, los textos y el cierre", () => {
    const p = buildPackage({ ...base, script: script(), clipUrls: urls });
    expect(p.version).toBe(1);
    expect(p.a_roll.map((a) => a.url)).toHaveLength(5);
    expect(p.b_roll[0]).toMatchObject({ anchor: "minutos", cut_s: 1.2, url: "https://x/B1.mp4" });
    expect(p.end_card).toMatchObject({ image_url: "https://x/base.jpg", cta: "Comprar" });
    expect(p.label).toBe("Dramatización");
    expect(p.accent_color).toBe(DEFAULT_ACCENT);
  });

  it("dice su formato, y el de la persona y el de la mascota de un ángulo se descargan con otro nombre", () => {
    expect(buildPackage({ ...base, script: script(), clipUrls: urls }).format).toBe("ugc");
    const mascot = buildPackage({ ...base, format: "mascot", script: script(), clipUrls: urls });
    expect(mascot).toMatchObject({ format: "mascot", label: "Animación" });
    expect(montageFile(3, "ugc")).toBe("video-angulo-3.json");
    expect(montageFile(3, "mascot")).toBe("video-angulo-3-mascota.json");
  });

  it("no se arma sin todos los clips", () => {
    const partial = new Map(urls);
    partial.delete("B2");
    expect(() => buildPackage({ ...base, script: script(), clipUrls: partial })).toThrow(PackageNotReady);
  });

  it("usa el acento de la página solo si es claro", () => {
    expect(captionAccent("#1e3a8a")).toBe(DEFAULT_ACCENT);
    expect(captionAccent("#7dd3fc")).toBe("#7DD3FC");
    expect(captionAccent("nope")).toBe(DEFAULT_ACCENT);
  });
});

describe("QA de imágenes clave", () => {
  it("falla con manos de más aunque el modelo no lo explique", () => {
    expect(keyframeQaVerdict({ hands_ok: false, product_ok: true, same_person: true, no_text: true, issues: [] })).toEqual({ pass: false, issues: ["Revisa las manos: hay una de más o está deforme."] });
    expect(keyframeQaVerdict({ hands_ok: true, product_ok: null, same_person: null, no_text: true, issues: [] }).pass).toBe(true);
  });
});

// KeraPass (POC mascota 2026-09-26): el guion que se generó y el usuario aprobó (voz «perfecta»).
const mascot = (): UgcScript => ({
  format_fit: { recommended: "mascot", why: "El hongo se ve y la uña se puede personificar con gracia." },
  persona: "a cute 3D animated big-toe character",
  character: {
    look: "the whole character is a single big toe rising from the bottom edge of the frame, no legs, peachy skin, smooth pink toenail on top like a forehead, big brown eyes, thick eyebrows, two small cartoon arms",
    wardrobe: "none",
    setting: "cozy home scenes, soft cinematic light",
  },
  hook_why: "La uña enferma que se esconde en un zapato da risa y se reconoce al instante.",
  keyframes: [
    { key: "K1", uses_character: true, uses_product: false, one_hand: false, prompt: "The character alone, healthy, front view, friendly smile." },
    { key: "K2", uses_character: true, uses_product: false, one_hand: false, prompt: "The character, its toenail thick and yellow-green, peeking out of a closed sneaker, grumpy." },
    { key: "K3", uses_character: true, uses_product: false, one_hand: false, prompt: "The character with a cracked toenail, arms crossed, among cream tubes and patches." },
    { key: "K4", uses_character: true, uses_product: true, one_hand: false, prompt: "The character looking up amazed at the product, golden sparkles." },
    { key: "K5", uses_character: true, uses_product: true, one_hand: false, prompt: "The character healthy again on a sunny beach in a tiny sandal, hugging the product." },
    { key: "K6", uses_character: false, uses_product: false, one_hand: false, prompt: "Macro of the cracked toenail with a blob of cream on top." },
    { key: "K7", uses_character: false, uses_product: false, one_hand: false, prompt: "Stylized 3D cross-section: hard amber layer, grumpy green spores beneath." },
  ],
  a_roll: [
    { key: "A1", keyframe: "K2", seconds: 5, line: "Hola. Soy la uña que mi dueño esconde en zapatos cerrados.", delivery: "Deadpan, offended.", acting: "Rolls its eyes.", motion: "Slow push-in." },
    { key: "A2", keyframe: "K3", seconds: 6, line: "Crema, parches, remedios caseros… nada. El hongo vive debajo de esta capa dura.", delivery: "Frustrated list.", acting: "Counts on tiny fingers.", motion: "Static." },
    { key: "A3", keyframe: "K4", seconds: 7, line: "Hasta que llegó Kera Pass: su urea ablanda la capa, y los activos antihongos llegan hasta el fondo.", delivery: "Wonder, then confident.", acting: "Points at its toenail.", motion: "Slow push-in." },
    { key: "A4", keyframe: "K5", seconds: 5, line: "¡Sandalias, aquí vamos! Kera Pass, con garantía y envío gratis.", delivery: "Joyful.", acting: "Dances, hugs the product.", motion: "Gentle sway." },
  ],
  b_roll: [
    { key: "B1", keyframe: "K6", anchor: "Crema", cut_s: 1.4, motion: "The cream slides off without absorbing." },
    { key: "B2", keyframe: "K7", anchor: "capa", cut_s: 1.6, motion: "Push-in to the hiding spores." },
    { key: "B3", keyframe: "K7", anchor: "fondo", cut_s: 1.6, motion: "Droplets reach the spores, which dissolve into light." },
  ],
  text_beats: [
    { anchor: "Hola", until: null, text: "La uña que nadie quiere mostrar" },
    { anchor: "nada", until: null, text: "Cremas y parches no llegan al fondo" },
    { anchor: "urea", until: null, text: "Urea + activos antihongos" },
    { anchor: "garantía", until: null, text: "Garantía y envío gratis" },
  ],
  end_card: { title: "KeraPass", subtitle: "Spray antihongos para uñas", cta: "Comprar", small_print: ["Animación ilustrativa. Lee las indicaciones del producto."] },
  compliance_notes: [],
});

describe("formato mascota", () => {
  it("acepta el guion de la POC KeraPass con los límites de mascota, no con los de UGC", () => {
    expect(scriptProblems(mascot(), pricing, "mascot")).toEqual([]);
    expect(scriptProblems(mascot(), pricing, "ugc").join(" ")).toMatch(/suman 23 s; deben sumar de 24/);
  });

  it("no deja hablarle a quien mira de su uña ni prometer plazos", () => {
    const s = mascot();
    s.a_roll[0].line = "Hola, soy la uña de tu pie y tus uñas lo saben.";
    s.a_roll[3].line = "¡Al día tres ya no pica! Sandalias, aquí vamos.";
    const problems = scriptProblems(s, pricing, "mascot").join(" ");
    expect(problems).toMatch(/«mi dueño»/);
    expect(problems).toMatch(/plazo de resultado/);
  });

  it("dibuja un cuadro de película animada, con el producto sin cara y los brazos contados", () => {
    const s = mascot();
    const k1 = String(keyframeRequest(s.keyframes[0], s, "K1", "mascot").input.prompt);
    expect(k1).toMatch(/3D animated movie, Pixar-style/);
    expect(k1).toMatch(/The character: a cute 3D animated big-toe character/);
    expect(k1).not.toMatch(/smartphone|wearing/);
    const k4 = String(keyframeRequest(s.keyframes[3], s, "K1", "mascot").input.prompt);
    expect(k4).toMatch(/same animated character as in the first reference image/);
    expect(k4).toMatch(/no face, no eyes, no arms/);
    expect(k4).toMatch(/two small cartoon arms/);
  });

  it("la mascota habla con la voz de personaje animado de la POC", () => {
    const r = aRollRequest(mascot().a_roll[2], "es", true, "mascot");
    const prompt = String(r.input.prompt);
    expect(r.input).toMatchObject({ duration: 7, generate_audio: true });
    expect(prompt).toMatch(/^3D animated movie shot/);
    expect(prompt).toContain("The animated character speaks with accurate lip-sync");
    expect(prompt).toContain("animated-movie character voice");
    expect(prompt).not.toMatch(/selfie/);
    expect(String(bRollRequest(mascot().b_roll[0], false, "mascot").input.prompt)).not.toMatch(/smartphone/);
  });

  it("el montaje la rotula como animación", () => {
    expect(videoLabel("mascot", "es")).toBe("Animación");
    expect(videoLabel("ugc", "es")).toBe("Dramatización");
    expect(videoLabel("mascot", "pt-BR")).toBe("Animação");
  });
});
