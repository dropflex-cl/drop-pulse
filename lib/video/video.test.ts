import { describe, expect, it } from "vitest";
import type { PricingPlan } from "@/lib/pricing/plan";
import { A_ROLL_ENDPOINT, B_ROLL_ENDPOINT, KEYFRAME_ENDPOINT, fileSlug, montageName } from "./catalog";
import { scriptCost, seedanceCostUsd } from "./cost";
import { DEFAULT_ACCENT, PackageNotReady, buildPackage, captionAccent, watermarkText } from "./package";
import { aRollRequest, bRollRequest, isAppearanceCategory, keyframeRefs, keyframeRequest, voiceBlock } from "./render";
import { applyScriptEdit, changedLines, keyframeQaVerdict, scriptProblems, words, type OpeningInput, type UgcScript } from "./schemas";
import { keyframeQaUser } from "./prompts";

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

  it("los textos en pantalla tampoco le hablan del cuerpo a quien mira", () => {
    const s = script();
    s.text_beats[1].text = "TUS ARRUGAS";
    expect(scriptProblems(s, pricing).join(" ")).toMatch(/texto en pantalla 2 .* le habla a quien mira/);
  });
});

describe("scriptProblems: la apertura del gancho", () => {
  const opening: OpeningInput = { hooks: [{ index: 1, shot: "selfie_talk" }, { index: 0, shot: "pov_hands" }, { index: 2, shot: "problem_scene" }] };
  /** El guion de la POC como sale ahora: con cámaras, la apertura y la imagen clave del gesto del gancho (K5). */
  const generated = (): UgcScript => {
    const s = script();
    const cams = { K1: "selfie", K2: "selfie", K3: "propped", K4: "pov" } as const;
    s.keyframes = s.keyframes.map((k) => ({ ...k, camera: cams[k.key as keyof typeof cams] }));
    s.keyframes[3] = { ...s.keyframes[3], prompt: "The product dropper over the fingertips, seen from above by the phone held in the other hand." };
    s.keyframes.push({ key: "K5", uses_character: true, uses_product: false, one_hand: false, camera: "selfie", prompt: "The person at the bathroom mirror leans toward the phone, eyebrows raised, sponge in hand." });
    s.a_roll[0] = { ...s.a_roll[0], keyframe: "K5" };
    s.opening = { hook_source: 1, shot: "selfie_talk", keyframe: "K5", first_motion: "She is already leaning toward the lens." };
    return s;
  };
  /** La misma apertura con un inserto: B1 (las manos con el gotario) tapa el comienzo de A1. */
  const pov = (): UgcScript => {
    const s = generated();
    s.a_roll[0] = { ...s.a_roll[0], keyframe: "K1" };
    s.keyframes = s.keyframes.filter((k) => k.key !== "K5");
    s.b_roll = [{ key: "B1", keyframe: "K4", anchor: "maquillas", cut_s: 1.6, motion: "The drops fall onto the fingertips." }, { ...s.b_roll[0], key: "B2" }];
    s.opening = { hook_source: 0, shot: "pov_hands", keyframe: "K4", first_motion: "Drops are already falling." };
    return s;
  };

  it("acepta la apertura con la cara y con un inserto", () => {
    expect(scriptProblems(generated(), pricing, "ugc", opening)).toEqual([]);
    expect(scriptProblems(pov(), pricing, "ugc", opening)).toEqual([]);
    expect(scriptProblems({ ...generated(), opening: { ...generated().opening!, hook_source: null } }, pricing, "ugc", opening)).toEqual([]);
  });

  it("el gancho elige la toma y tiene que ser uno de la lista", () => {
    const s = generated();
    expect(scriptProblems({ ...s, opening: { ...s.opening!, hook_source: 7 } }, pricing, "ugc", opening).join(" ")).toMatch(/hook_source es 7, que no está/);
    expect(scriptProblems({ ...s, opening: { ...s.opening!, hook_source: 2 } }, pricing, "ugc", opening).join(" ")).toMatch(/El gancho 2 abre con problem_scene/);
    expect(scriptProblems({ ...s, opening: undefined }, pricing, "ugc", opening).join(" ")).toMatch(/Falta opening/);
  });

  it("abrir con la cara no parte del retrato K1", () => {
    const s = generated();
    s.a_roll[0] = { ...s.a_roll[0], keyframe: "K1" };
    s.opening = { ...s.opening!, keyframe: "K1" };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/no parte de K1/);
  });

  it("abrir con un inserto pone B1 al comienzo, desde la imagen clave de la apertura", () => {
    const s = pov();
    s.b_roll[0] = { ...s.b_roll[0], anchor: "errores", keyframe: "K3" };
    const p = scriptProblems(s, pricing, "ugc", opening).join(" ");
    expect(p).toMatch(/B1 parte de opening.keyframe \(K4\)/);
    expect(p).toMatch(/B1 abre el video: se ancla a una de las primeras 5 palabras/);
  });

  it("la mascota abre con su escena, nunca con el personaje sano", () => {
    const s = generated();
    expect(scriptProblems(s, pricing, "mascot", { hooks: [{ index: 1, shot: "mascot_scene" }] }).join(" ")).toMatch(/la mascota abre con su escena/i);
    s.opening = { ...s.opening!, shot: "mascot_scene", keyframe: "K1" };
    s.a_roll[0] = { ...s.a_roll[0], keyframe: "K1" };
    expect(scriptProblems(s, pricing, "mascot", { hooks: [{ index: 1, shot: "mascot_scene" }] }).join(" ")).toMatch(/no parte de K1/);
  });

  it("la primera frase de A1 cabe en 3 s", () => {
    const s = generated();
    s.a_roll[0].line = "¿Te maquillas apurada en siete minutos todas las mañanas antes del trabajo? Entonces seguro cometes estos tres errores.";
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/primera frase de A1 .* tiene 12 palabras/);
    expect(scriptProblems(s, pricing).join(" ")).not.toMatch(/primera frase/);
  });

  it("el primer texto en pantalla se lee desde el primer segundo", () => {
    const s = generated();
    s.text_beats[0] = { ...s.text_beats[0], anchor: "errores" };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/primeras 5 palabras de A1/);
    s.text_beats[0] = { anchor: "maquillas", until: null, text: "MAQUILLAJE EN SIETE MINUTOS ANTES DEL TRABAJO" };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/tiene 7 palabras; el del gancho va hasta 6/);
  });

  it("el pago contra entrega no va en el gancho", () => {
    const s = generated();
    s.text_beats[0] = { anchor: "maquillas", until: null, text: "PAGAS AL RECIBIR" };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/no van en el gancho/);
  });
});

describe("scriptProblems: que parezca de teléfono", () => {
  const opening: OpeningInput = { hooks: [] };
  const base = (): UgcScript => {
    const s = script();
    s.keyframes = s.keyframes.map((k) => ({ ...k, camera: k.key === "K3" ? "propped" : k.key === "K4" ? "pov" : "selfie", prompt: k.key === "K4" ? "The product dropper over the fingertips, seen from above." : k.prompt }));
    s.keyframes.push({ key: "K5", uses_character: true, uses_product: false, one_hand: false, camera: "selfie", prompt: "The person leans toward the phone in her bathroom." });
    s.a_roll[0] = { ...s.a_roll[0], keyframe: "K5" };
    s.opening = { hook_source: null, shot: "selfie_talk", keyframe: "K5", first_motion: "She leans in." };
    return s;
  };

  it("cada imagen clave dice su cámara y el B-roll no es selfie", () => {
    expect(scriptProblems(base(), pricing, "ugc", opening)).toEqual([]);
    const s = base();
    s.keyframes[2] = { ...s.keyframes[2], camera: undefined, uses_character: true };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/K3 no dice su cámara/);
    s.keyframes[2] = { ...s.keyframes[2], camera: "selfie" };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).toMatch(/K3 es de un B-roll: va en pov/);
  });

  it("rechaza el lenguaje de estudio, salvo lo negado", () => {
    const s = base();
    s.keyframes[3] = { ...s.keyframes[3], prompt: "Macro of the dropper, shallow depth of field, soft morning light." };
    s.character.setting = "a cozy studio with golden hour light";
    s.b_roll[1] = { ...s.b_roll[1], motion: "Cinematic slow motion of the drops." };
    const p = scriptProblems(s, pricing, "ugc", opening).join(" ");
    expect(p).toMatch(/K4 habla como una foto de estudio \(«Macro»\)/);
    expect(p).toMatch(/character.setting habla como una foto de estudio/);
    expect(p).toMatch(/El movimiento de B2 habla como un comercial/);
    s.keyframes[3] = { ...s.keyframes[3], prompt: "The dropper over the fingertips, no bokeh, everything in focus." };
    expect(scriptProblems(s, pricing, "ugc", opening).join(" ")).not.toMatch(/K4 habla/);
  });

  it("la mascota no pasa por las reglas del teléfono", () => {
    const s = base();
    s.keyframes = s.keyframes.map((k) => ({ ...k, camera: "animated", prompt: `${k.prompt} Soft cinematic lighting.` }));
    s.opening = { ...s.opening!, shot: "mascot_scene" };
    expect(scriptProblems(s, pricing, "mascot", { hooks: [] }).join(" ")).not.toMatch(/cámara|estudio/);
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

describe("render: que parezca de teléfono y que abra con el gancho", () => {
  const opened = (): UgcScript => {
    const s = script();
    s.keyframes = s.keyframes.map((k) => ({ ...k, camera: k.key === "K4" ? "pov" : k.key === "K3" ? "propped" : "selfie" }));
    s.opening = { hook_source: 0, shot: "selfie_talk", keyframe: "K2", first_motion: "She is already lifting the product to her cheek." };
    return s;
  };

  it("la imagen clave describe un teléfono en una casa, con su cámara, y la persona es común", () => {
    const s = opened();
    const k1 = String(keyframeRequest(s.keyframes[0], s, "K1").input.prompt);
    expect(k1).toMatch(/photo taken with a phone at home/);
    expect(k1).toMatch(/front camera at arm's length/);
    expect(k1).toMatch(/not a model: natural skin texture with visible pores/);
    expect(k1).not.toMatch(/natural light, like a frame/);
    expect(String(keyframeRequest(s.keyframes[3], s, "K1").input.prompt)).toMatch(/rear camera held in one hand/);
    // En belleza, la persona no muestra el problema que el producto promete arreglar.
    expect(String(keyframeRequest(s.keyframes[0], s, "K1", "ugc", { appearance: true }).input.prompt)).not.toMatch(/pores|uneven/);
    expect(isAppearanceCategory("Belleza y cuidado de la piel")).toBe(true);
    expect(isAppearanceCategory("hogar")).toBe(false);
  });

  it("la imagen de la apertura es el cuadro 0, con la acción en marcha; las demás no", () => {
    const s = opened();
    expect(String(keyframeRequest(s.keyframes[1], s, "K1").input.prompt)).toMatch(/very first frame of the video: the action is already happening \(She is already lifting the product to her cheek\)/);
    expect(String(keyframeRequest(s.keyframes[2], s, "K1").input.prompt)).not.toMatch(/first frame/);
  });

  it("la toma hablada que abre arranca en movimiento y con el pulso de una mano", () => {
    const s = opened();
    const a1 = { ...s.a_roll[0], keyframe: "K2" };
    const p = String(aRollRequest(a1, "es", true, "ugc", s.opening).input.prompt);
    expect(p).toMatch(/^Handheld vertical phone video recorded by the person: small natural hand shake/);
    expect(p).toMatch(/already happening from the very first frame/);
    expect(String(aRollRequest(s.a_roll[1], "es", false, "ugc", s.opening).input.prompt)).not.toMatch(/very first frame/);
  });

  it("el B-roll del UGC sigue su cámara, abre en movimiento y excluye lo cinematográfico", () => {
    const s = opened();
    s.opening = { hook_source: 0, shot: "pov_hands", keyframe: "K4", first_motion: "Drops are already falling." };
    const b1 = { ...s.b_roll[1], key: "B1" };
    const r = bRollRequest(b1, true, "ugc", "pov", s.opening);
    expect(String(r.input.prompt)).toMatch(/^The action is already happening from the very first frame: Drops are already falling\./);
    expect(String(r.input.prompt)).toMatch(/rear camera looking down at the hands/);
    expect(String(r.input.negative_prompt)).toMatch(/cinematic, bokeh, shallow depth of field, slow motion/);
    expect(String(bRollRequest(mascot().b_roll[0], false, "mascot").input.negative_prompt)).not.toMatch(/cinematic/);
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
    expect(p.version).toBe(2);
    expect(p.opening).toBeNull();
    expect(p.look).toBe("phone");
    expect(p.a_roll.map((a) => a.url)).toHaveLength(5);
    expect(p.b_roll[0]).toMatchObject({ anchor: "minutos", cut_s: 1.2, url: "https://x/B1.mp4" });
    expect(p.end_card).toMatchObject({ image_url: "https://x/base.jpg", cta: "Comprar" });
    // Sin rótulo de dramatización ni de animación (decisión del comerciante, 2026-10-01).
    expect(p).not.toHaveProperty("label");
    expect(p.accent_color).toBe(DEFAULT_ACCENT);
  });

  it("lleva la apertura: el inserto del gancho si abre con uno, y el aspecto por formato", () => {
    const s = script();
    s.opening = { hook_source: 0, shot: "pov_hands", keyframe: "K3", first_motion: "x" };
    expect(buildPackage({ ...base, script: s, clipUrls: urls }).opening).toEqual({ shot: "pov_hands", insert: "B1" });
    s.opening = { hook_source: 1, shot: "selfie_talk", keyframe: "K1", first_motion: "x" };
    expect(buildPackage({ ...base, script: s, clipUrls: urls }).opening).toEqual({ shot: "selfie_talk", insert: null });
    expect(buildPackage({ ...base, format: "mascot", script: s, clipUrls: urls }).look).toBe("clean");
  });

  it("dice su formato y se llama por el producto, el formato y el ángulo", () => {
    const ugc = buildPackage({ ...base, script: script(), clipUrls: urls });
    expect(ugc).toMatchObject({ format: "ugc", name: "deep-collagen-ugc-angulo-3" });
    const mascot = buildPackage({ ...base, format: "mascot", script: script(), clipUrls: urls });
    expect(mascot).toMatchObject({ format: "mascot", name: "deep-collagen-mascota-angulo-3" });
  });

  it("arma el nombre del archivo sin tildes ni símbolos y sin cortar palabras", () => {
    expect(montageName("URO Vaginal Probiótico — 60 cápsulas", 1, "mascot")).toBe("uro-vaginal-probiotico-60-capsulas-mascota-angulo-1");
    expect(fileSlug("Ñandú: crema «Día y Noche» 2x1")).toBe("nandu-crema-dia-y-noche-2x1");
    expect(fileSlug("Probiótico íntimo para mujer con arándano rojo y vitamina C, 60 cápsulas")).toBe("probiotico-intimo-para-mujer-con");
    expect(fileSlug("¡¡!!")).toBe("video");
  });

  it("lleva la marca de agua: el dominio propio, o el nombre si la tienda solo tiene .myshopify.com", () => {
    expect(buildPackage({ ...base, watermark: "tutienda.cl", script: script(), clipUrls: urls }).watermark).toBe("tutienda.cl");
    expect(buildPackage({ ...base, script: script(), clipUrls: urls }).watermark).toBeNull();
    expect(watermarkText("www.TuTienda.cl", "Tu Tienda")).toBe("tutienda.cl");
    expect(watermarkText("tu-tienda.myshopify.com", "Tu Tienda")).toBe("Tu Tienda");
    expect(watermarkText("tu-tienda.myshopify.com", "  ")).toBe("tu-tienda.myshopify.com");
    expect(watermarkText(null, null)).toBeNull();
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
  const ok = { hands_ok: true, product_ok: null, same_person: null, no_text: true, brand_safe: true, matches_hook: null, phone_look: null, issues: [] as string[] };
  it("falla con manos de más aunque el modelo no lo explique", () => {
    expect(keyframeQaVerdict({ ...ok, hands_ok: false, product_ok: true, same_person: true })).toEqual({ pass: false, issues: ["Revisa las manos: hay una de más o está deforme."] });
    expect(keyframeQaVerdict(ok).pass).toBe(true);
    // Una forma sugerente falla siempre y va primero, aunque el modelo haya anotado otra cosa.
    const unsafe = keyframeQaVerdict({ ...ok, brand_safe: false, issues: ["Los ojos quedaron chicos."] });
    expect(unsafe.pass).toBe(false);
    expect(unsafe.issues[0]).toMatch(/puede leerse como algo sexual/);
  });

  it("la apertura tiene que mostrar el gancho; parecer de estudio solo avisa", () => {
    expect(keyframeQaVerdict({ ...ok, matches_hook: false })).toEqual({ pass: false, issues: ["No muestra la primera toma del gancho: pide otra."] });
    expect(keyframeQaVerdict({ ...ok, matches_hook: true }).pass).toBe(true);
    expect(keyframeQaVerdict({ ...ok, phone_look: false })).toEqual({ pass: true, issues: ["Parece foto de estudio: si no te convence, pide otra."] });
    expect(keyframeQaVerdict({ ...ok, phone_look: true })).toEqual({ pass: true, issues: [] });
  });

  it("el QA sabe si es la apertura y si es la mascota", () => {
    const k = { key: "K5", prompt: "x", uses_product: false };
    expect(keyframeQaUser(k, true, "ugc", { first_motion: "She leans in.", hook: "No compres otra." })).toMatch(/APERTURA[\s\S]*She leans in\.[\s\S]*«No compres otra\.»[\s\S]*revisa phone_look/);
    expect(keyframeQaUser(k, true, "mascot")).toMatch(/matches_hook = null[\s\S]*phone_look = null/);
  });
});

// KeraPass (POC mascota 2026-09-26): el guion que se generó y el usuario aprobó (voz «perfecta»).
const mascot = (): UgcScript => ({
  format_fit: { recommended: "mascot", why: "El hongo se ve y la uña se puede personificar con gracia." },
  persona: "a round, chubby 3D animated toenail character shaped like a small flat shield",
  character: {
    look: "a palm-sized flat shield-shaped toenail, pastel pink and glossy, wider than tall, big brown eyes, thick eyebrows, two small cartoon arms, no legs",
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

  it("rechaza siluetas que se leen como algo sexual (el dedo de la POC, la piel con cuello de Deep Collagen)", () => {
    const risky = [
      { persona: "a cute 3D animated big-toe character", look: "a single big toe rising from the bottom edge of the frame, peachy skin" },
      { persona: "a soft, rounded patch of facial skin with a small neck below it", look: "a rounded blob of soft peach-toned facial skin" },
      { persona: "a cute cheek character", look: "a plump cheek that rises from the bottom edge of the frame" },
    ];
    for (const r of risky) {
      const s = mascot();
      s.persona = r.persona;
      s.character.look = r.look;
      expect(scriptProblems(s, pricing, "mascot").join(" ")).toMatch(/puede leerse como algo sexual/);
    }
    // Lo negado no cuenta: así describió el modelo la mascota en producción y la regla rechazó los 6 intentos.
    const negated = mascot();
    negated.persona = "a round, chubby 3D animated water-droplet character, no neck, never rising from the bottom edge";
    negated.character.look = "pastel blue droplet as wide as it is tall, without any elongated or cylindrical shape, not a patch of skin; no fingers, no toes";
    expect(scriptProblems(negated, pricing, "mascot")).toEqual([]);
    // Pero un rasgo riesgoso dicho en positivo sigue contando aunque la frase tenga otro «no».
    const mixed = mascot();
    mixed.character.look = "a rounded blob of peach skin with a little neck below, no legs";
    expect(scriptProblems(mixed, pricing, "mascot").join(" ")).toMatch(/puede leerse como algo sexual/);
    // Manos de cuatro dedos o una uña del pie no son formas riesgosas.
    const ok = mascot();
    ok.character.look += ", four-fingered hands, a toenail forehead";
    expect(scriptProblems(ok, pricing, "mascot")).toEqual([]);
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
    expect(k1).toMatch(/The character: a round, chubby 3D animated toenail character/);
    expect(k1).toMatch(/round, chubby, instantly readable silhouette/);
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
});
