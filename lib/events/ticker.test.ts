import { describe, expect, it } from "vitest";
import { EMPTY_POLICIES } from "@/lib/settings/policies";
import { tickerItems, tickerPolicyItems } from "./ticker";

describe("cinta de avisos", () => {
  it("sin políticas, solo el pago al recibir (y el envío gratis por defecto)", () => {
    expect(tickerPolicyItems({ ...EMPTY_POLICIES, freeShipping: false }, "CLP").map((i) => i.text)).toEqual(["Pagas al recibir"]);
    expect(tickerPolicyItems(EMPTY_POLICIES, "CLP").map((i) => i.text)).toEqual(["Pagas al recibir", "Envío gratis"]);
  });

  it("con todo, en el orden del Liquid y con los datos reales", () => {
    const items = tickerPolicyItems(
      { ...EMPTY_POLICIES, freeShippingThreshold: 40000, handlingDays: 1, transitDaysMin: 2, transitDaysMax: 4, returnDays: 30, warrantyMonths: 1, whatsapp: "56912345678" },
      "CLP",
    );
    expect(items.map((i) => i.text)).toEqual(["Pagas al recibir", "Envío gratis desde $40.000", "Llega en 3 a 5 días hábiles", "30 días para cambios", "Garantía de 1 mes", "Atención por WhatsApp"]);
  });

  it("un plazo exacto no dice «3 a 3»; la garantía en plural", () => {
    const items = tickerPolicyItems({ ...EMPTY_POLICIES, freeShipping: false, transitDaysMin: 3, transitDaysMax: 3, warrantyMonths: 6 }, "CLP");
    expect(items.map((i) => i.text)).toEqual(["Pagas al recibir", "Llega en 3 días hábiles", "Garantía de 6 meses"]);
  });

  it("aviso del evento, mensajes propios y políticas", () => {
    expect(tickerItems("Cyber: precios especiales", ["Stock limitado", " "], [{ icon: "cash", text: "Pagas al recibir" }])).toEqual([
      { icon: "sparkles", text: "Cyber: precios especiales" },
      { icon: "check", text: "Stock limitado" },
      { icon: "cash", text: "Pagas al recibir" },
    ]);
  });
});
