import { describe, expect, it } from "vitest";
import { campaignName, creationDate, creativeType, creativeTypes, unitName } from "./naming";

describe("nombres en Meta", () => {
  const n = { product: "Deep Collagen", structure: "abo" as const, date: "26-09-2026" };

  it("el tipo de creativo dice de qué formato de Creativos sale; los subidos a mano, video o imagen", () => {
    expect(creativeType({ kind: "video", format: "ugc" })).toBe("Video UGC");
    expect(creativeType({ kind: "video", format: "mascot" })).toBe("Video mascota");
    expect(creativeType({ kind: "video" })).toBe("Video");
    expect(creativeType({ kind: "image", format: "chat" })).toBe("Chat WhatsApp");
    expect(creativeType({ kind: "image", format: null })).toBe("Imagen");
  });

  it("la campaña lista los tipos distintos en el orden de los creativos", () => {
    expect(creativeTypes([{ kind: "image" }, { kind: "video", format: "ugc" }, { kind: "image" }])).toBe("Imagen + Video UGC");
    expect(campaignName(n, [{ kind: "video" }, { kind: "video" }])).toBe("Deep Collagen | ABO | Video | 26-09-2026");
    expect(campaignName({ ...n, structure: "cbo" }, [])).toBe("Deep Collagen | CBO | Sin creativos | 26-09-2026");
  });

  it("un conjunto o anuncio agrega al final lo que lo distingue", () => {
    expect(unitName(n, [{ kind: "image" }], "Conjunto 2 · antes-despues")).toBe("Deep Collagen | ABO | Imagen | 26-09-2026 | Conjunto 2 · antes-despues");
  });

  it("el producto no rompe el separador ni se alarga de más", () => {
    expect(campaignName({ ...n, product: "  Crema | día   y noche " }, [{ kind: "image" }])).toBe("Crema / día y noche | ABO | Imagen | 26-09-2026");
    expect(campaignName({ ...n, product: "x".repeat(80) }, [{ kind: "image" }]).split(" | ")[0]).toHaveLength(50);
  });

  it("la fecha es dd-mm-aaaa en la zona horaria de la cuenta", () => {
    // 02:30 UTC del 27 es todavía el 26 en Santiago (UTC−3).
    expect(creationDate(new Date("2026-09-27T02:30:00Z"), "America/Santiago")).toBe("26-09-2026");
    expect(creationDate(new Date("2026-09-27T02:30:00Z"), "UTC")).toBe("27-09-2026");
  });
});
