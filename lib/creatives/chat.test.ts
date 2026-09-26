import { describe, expect, it } from "vitest";
import type { PricingPlan } from "@/lib/pricing/plan";
import { conceptRatios } from "./catalog";
import { chatBakedTexts, chatRenderPrompt, chatShapeProblem, normalizeChat, type WhatsappChat } from "./chat";
import { chatRenderRequest } from "./render";
import { chatOutputSchema, chatProblems } from "./schemas";

const pricing = { currency: "CLP", salePrice: 24990, compareAtPrice: 39990, packs: [{ units: 1, price: 24990, perUnitPrice: 24990, savings: 0 }] } as unknown as PricingPlan;

const chat = (over: Partial<WhatsappChat> = {}): WhatsappChat => ({
  contact_name: "Fran 💗",
  contact_gender: "woman",
  clock: "21:48",
  messages: [
    { from: "friend", text: "Amiga, no sabes lo que me pasó con la lima eléctrica", time: "21:40", photo: false },
    { from: "friend", text: "Mira, la uso cada noche y mis talones quedan suavecitos", time: "21:41", photo: true },
    { from: "me", text: "Jaja la he visto en TikTok, ¿de verdad funciona?", time: "21:43", photo: false },
    { from: "friend", text: "Demasiado, y es súper fácil. Pagué cuando me llegó", time: "21:45", photo: false },
    { from: "me", text: "Ya, pásame el link porfa", time: "21:47", photo: false },
  ],
  ...over,
});

describe("chatShapeProblem", () => {
  it("acepta un chat bien armado", () => {
    expect(chatShapeProblem(chat())).toBeNull();
  });

  it("pide exactamente una foto, del contacto", () => {
    const two = chat();
    two.messages[3].photo = true;
    expect(chatShapeProblem(two)).toMatch(/Exactamente un mensaje/);
    const mine = chat();
    mine.messages[1].photo = false;
    mine.messages[2].photo = true;
    expect(chatShapeProblem(mine)).toMatch(/la manda tu contacto/);
  });

  it("la última palabra es del lector", () => {
    const c = chat();
    c.messages[4].from = "friend";
    expect(chatShapeProblem(c)).toMatch(/último mensaje debe ser tuyo/);
  });

  it("limita la cantidad, el largo y el orden de las horas", () => {
    expect(chatShapeProblem(chat({ messages: chat().messages.slice(0, 4) }))).toMatch(/al menos 5/);
    const long = chat();
    long.messages[0].text = "a".repeat(121);
    expect(chatShapeProblem(long)).toMatch(/pasa de 120/);
    const back = chat();
    back.messages[2].time = "21:30";
    expect(chatShapeProblem(back)).toMatch(/de menor a mayor/);
  });
});

describe("normalizeChat", () => {
  it("rellena la hora y limpia espacios", () => {
    const c = normalizeChat(chat({ clock: "9:05", contact_name: "  Fran   💗 " }));
    expect(c.clock).toBe("09:05");
    expect(c.contact_name).toBe("Fran 💗");
  });
});

describe("chatProblems", () => {
  it("aplica las reglas de los textos horneados: montos y salud", () => {
    const c = chat();
    c.messages[3].text = "Lo pagué $9.990 y me curó los hongos";
    const problems = chatProblems(c, pricing).join(" ");
    expect(problems).toMatch(/monto que no está/);
    const cure = chat();
    cure.messages[3].text = "Te juro que cura todo";
    expect(chatProblems(cure, pricing).join(" ")).toMatch(/resultado de salud/);
    expect(chatProblems(chat(), pricing)).toEqual([]);
  });
});

describe("render del chat", () => {
  it("va en 9:16, directo, con cada burbuja exacta y la zona 4:5 del feed", () => {
    const req = chatRenderRequest(chat(), "es-CL", "pink electric foot file");
    expect(req.mode).toBe("direct");
    expect(req.presetId).toBeNull();
    expect(req.input.aspect_ratio).toBe("9:16");
    expect(req.input.enhance_prompt).toBe(false);
    const prompt = String(req.input.prompt);
    for (const m of chat().messages) expect(prompt).toContain(`"${m.text}"`);
    expect(prompt).toContain('"en línea"');
    expect(prompt).toContain('"Escribe un mensaje"');
    expect(prompt).toContain("pink electric foot file");
    expect(prompt).toMatch(/between 15% and 85%/);
    expect(prompt).toMatch(/2\. INCOMING .*PHOTO BUBBLE/);
    expect(prompt).toMatch(/5\. OUTGOING/);
  });

  it("usa las etiquetas del idioma del mercado y la foto de perfil del género", () => {
    const prompt = chatRenderPrompt(chat({ contact_gender: "man" }), "pt-BR");
    expect(prompt).toContain('"Mensagem"');
    expect(prompt).toContain("a young man");
  });

  it("el chat solo se genera en 9:16; los demás, 1:1 primero", () => {
    expect(conceptRatios("whatsapp_chat")).toEqual(["9:16"]);
    expect(conceptRatios("hero")[0]).toBe("1:1");
  });

  it("el QA busca el contacto y cada burbuja con texto", () => {
    const texts = chatBakedTexts(chat({ messages: chat().messages.map((m) => (m.photo ? { ...m, text: "" } : m)) }));
    expect(texts[0]).toEqual({ role: "contact", text: "Fran 💗" });
    expect(texts).toHaveLength(5);
    expect(texts.map((t) => t.role)).toEqual(["contact", "incoming", "outgoing", "incoming", "outgoing"]);
  });
});

describe("chatOutputSchema", () => {
  it("valida la salida del modelo", () => {
    const { contact_name, contact_gender, clock, messages } = chat();
    expect(chatOutputSchema.safeParse({ name: "Fran", why: "Resuelve la duda", contact_name, contact_gender, clock, messages }).success).toBe(true);
  });
});
