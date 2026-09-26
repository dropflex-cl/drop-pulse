import { describe, expect, it } from "vitest";
import { EMPTY_ORDER, MESSAGE_GROUPS, MESSAGES, TIP_MESSAGE, deliveryText, missingPolicies, orderTotal, renderMessage, tipText, type MessageFacts } from "./messages";

const facts: MessageFacts = {
  store: "Datazo",
  product: "Corrector de postura",
  currency: "CLP",
  packs: [
    { units: 1, price: 24990 },
    { units: 2, price: 37490 },
    { units: 3, price: 49990 },
  ],
  delivery: { min: 2, max: 4, businessDays: true },
  returnDays: 30,
  warrantyMonths: 6,
  countryCode: "CL",
  tip: "Úsalo 20 minutos al día al principio y ve sumando tiempo.",
};

const bare: MessageFacts = { ...facts, store: null, delivery: null, returnDays: null, warrantyMonths: null, tip: null };

const byId = (id: string) => MESSAGES.find((m) => m.id === id)!;
const render = (id: string, f: MessageFacts = facts, order = EMPTY_ORDER) => renderMessage(byId(id), f, order);

describe("mensajes de WhatsApp", () => {
  it("son 13, cada uno en un grupo que existe, con ids únicos", () => {
    expect(MESSAGES).toHaveLength(13);
    expect(new Set(MESSAGES.map((m) => m.id)).size).toBe(13);
    const groups = new Set(MESSAGE_GROUPS.map((g) => g.id));
    for (const m of MESSAGES) expect(groups.has(m.group)).toBe(true);
    expect(byId(TIP_MESSAGE)).toBeDefined();
  });

  it("la confirmación sale con el formato de WhatsApp y los datos del pedido", () => {
    const { text, missing } = render("confirm", facts, { ...EMPTY_ORDER, name: "María", units: 2, address: "Los Aromos 123", area: "Ñuñoa" });
    expect(text).toBe(
      [
        "Hola María 👋 Te escribimos de *Datazo* para confirmar tu pedido:",
        "",
        "🛍️ *2 × Corrector de postura*",
        "💵 Total: *$37.490*. Pagas en efectivo al recibir.",
        "📍 Envío a: Los Aromos 123, Ñuñoa",
        "",
        "¿Nos confirmas que los datos están bien y que tendrás el efectivo el día de la entrega? Responde *SÍ* y lo dejamos listo para despacho.",
      ].join("\n"),
    );
    expect(missing).toEqual([]);
  });

  it("sin nombre ni tienda, el saludo queda natural; la dirección que falta se marca para completarla", () => {
    const { text, missing } = render("confirm", bare);
    expect(text.split("\n")[0]).toBe("Hola 👋 Te escribimos para confirmar tu pedido:");
    expect(text).toContain("📍 Envío a: [dirección], [comuna]");
    expect(text).toContain("*1 × Corrector de postura*");
    expect(text).toContain("*$24.990*");
    expect(missing).toEqual(["dirección", "comuna"]);
    expect(render("confirmed", bare, { ...EMPTY_ORDER, name: "" }).text.startsWith("Listo, tu pedido quedó confirmado ✅")).toBe(true);
  });

  it("lo que no está en Ajustes no se promete: sin plazo, cambios ni garantía, esas líneas no van", () => {
    expect(render("confirmed").text).toContain("🚚 Te llega en *2 a 4 días hábiles*.");
    expect(render("confirmed", bare).text).not.toContain("Te llega");
    expect(render("doubts").text).toContain("Además, tienes *30 días* para cambios o devoluciones.");
    expect(render("doubts", bare).text).not.toContain("Además");
    expect(render("delivered").text).toContain("Recuerda que tienes *6 meses* de garantía.");
    expect(render("delivered", bare).text).not.toContain("garantía");
  });

  it("el consejo de uso va en «Entregado» solo si existe, sin dejar párrafos vacíos", () => {
    const withTip = render("delivered").text;
    expect(withTip).toContain("💡 Un consejo para sacarle el máximo: úsalo 20 minutos al día al principio y ve sumando tiempo.");
    const without = render("delivered", bare).text;
    expect(without).not.toContain("💡");
    expect(without).not.toMatch(/\n{3,}/);
    expect(without).toBe(
      ["Hola, vimos que tu pedido de *Corrector de postura* ya llegó 🙌 Gracias por comprar.", "", "Si tienes cualquier duda, escríbenos por aquí."].join("\n"),
    );
  });

  it("el seguimiento pide la guía si falta y el link es opcional", () => {
    const empty = render("shipped");
    expect(empty.text).toContain("N.º de seguimiento: *[n.º de seguimiento]*");
    expect(empty.text).not.toContain("Puedes ver dónde va");
    expect(empty.missing).toEqual(["n.º de seguimiento"]);
    const full = render("shipped", facts, { ...EMPTY_ORDER, tracking: "BX123456", trackingUrl: "https://track.example/BX123456" });
    expect(full.text).toContain("N.º de seguimiento: *BX123456*");
    expect(full.text).toContain("Puedes ver dónde va aquí: https://track.example/BX123456");
    expect(full.missing).toEqual([]);
  });

  it("fuera de Chile pide la ciudad en vez de la comuna", () => {
    const co = { ...facts, countryCode: "CO" };
    expect(render("address", co).text).toContain("• Ciudad");
    expect(render("address").text).toContain("• Comuna");
    expect(render("confirm", co).missing).toEqual(["dirección", "ciudad"]);
  });

  it("ningún mensaje queda con tokens sin llenar, tramos sueltos ni negritas abiertas", () => {
    for (const m of MESSAGES) {
      for (const f of [facts, bare]) {
        const { text } = renderMessage(m, f, { name: "Ana", units: 1, address: "Calle 1", area: "Centro", tracking: "X1", trackingUrl: "https://t.example" });
        expect(text, m.id).not.toMatch(/[{}]/);
        expect(text, m.id).not.toMatch(/\[/);
        for (const line of text.split("\n")) expect((line.match(/\*/g) ?? []).length % 2, `${m.id}: ${line}`).toBe(0);
      }
    }
  });

  it("en español neutro con tuteo, sin voseo ni «usted»", () => {
    const all = MESSAGES.flatMap((m) => m.lines).join("\n");
    expect(all).not.toMatch(/\busted\b/i);
    expect(all).not.toMatch(/\b(tenés|podés|querés|confirmá|respondé|escribinos|avisanos)\b/i);
  });
});

describe("datos que completan los mensajes", () => {
  it("el total es el precio del pack; sin pack, 1 unidad × N", () => {
    expect(orderTotal(facts, 3)).toBe(49990);
    expect(orderTotal({ packs: [{ units: 1, price: 10000 }] }, 2)).toBe(20000);
    expect(orderTotal({ packs: [] }, 1)).toBeNull();
  });

  it("los plazos se dicen como los calcula la tienda", () => {
    expect(deliveryText({ min: 2, max: 4, businessDays: true })).toBe("2 a 4 días hábiles");
    expect(deliveryText({ min: 3, max: 3, businessDays: false })).toBe("3 días");
    expect(deliveryText({ min: 1, max: 1, businessDays: true })).toBe("1 día hábil");
  });

  it("el consejo sigue a los dos puntos: minúscula inicial (salvo siglas) y punto final", () => {
    expect(tipText("Cárgalo antes del primer uso")).toBe("cárgalo antes del primer uso.");
    expect(tipText("USB-C: usa el cable que viene.")).toBe("USB-C: usa el cable que viene.");
  });

  it("dice qué falta en Ajustes", () => {
    expect(missingPolicies(facts)).toEqual([]);
    expect(missingPolicies(bare)).toEqual(["los plazos de entrega", "los días para cambios", "la garantía"]);
  });
});
