import { describe, expect, it } from "vitest";
import { ago, formatSpent, toMetaAssets } from "./assets";

const now = Date.parse("2026-09-23T12:00:00Z");

describe("activos de Meta para O7", () => {
  const assets = toMetaAssets(
    {
      accounts: [
        { id: "act_1", name: "Pruebas", account_status: 2, currency: "CLP" },
        { id: "act_2", name: "Mi Tienda USD", account_status: 1, currency: "USD" },
        {
          id: "act_3",
          name: "Mi Tienda CL",
          account_status: 1,
          currency: "CLP",
          account_id: "3",
          timezone_name: "America/Santiago",
          amount_spent: "1250000",
          business: { id: "b1", name: "Tiendas SpA" },
        },
      ],
      pages: [{ id: "p1", name: "Mi Tienda", username: "mitienda", category: "Tienda" }],
      pixelsByAccount: {
        act_2: [],
        act_3: [
          { id: "x1", name: "Viejo", last_fired_time: "2026-09-01T00:00:00Z" },
          { id: "x2", name: "Activo", last_fired_time: "2026-09-23T10:00:00Z", owner_business: { id: "b1", name: "Tiendas SpA" } },
        ],
      },
    },
    "CLP",
    now,
  );

  it("sugiere la cuenta activa en la moneda de la tienda y el píxel más reciente", () => {
    expect(assets.suggested).toEqual({ account: "act_3", page: "p1", pixel: "x2" });
    expect(assets.adAccounts.find((a) => a.value === "act_3")?.tag).toBe("Sugerida");
  });

  it("deja las deshabilitadas al final, con su motivo", () => {
    expect(assets.adAccounts.at(-1)).toMatchObject({ value: "act_1", disabled: true, tone: "danger", meta: "Deshabilitada por Meta" });
  });

  it("avisa sin bloquear si el píxel no recibe eventos", () => {
    expect(assets.pixelsByAccount.act_3[1]).toMatchObject({ value: "x1", tone: "warning" });
    expect(assets.pixelsByAccount.act_3[1].disabled).toBeUndefined();
  });

  it("muestra el ID y los datos para distinguir cuentas, páginas y píxeles", () => {
    expect(assets.adAccounts.find((a) => a.value === "act_3")).toMatchObject({
      id: "3",
      details: ["Tiendas SpA", "America/Santiago", "Gastado $1.250.000"],
    });
    expect(assets.adAccounts.find((a) => a.value === "act_2")).toMatchObject({ id: "2", details: ["Cuenta personal"] });
    expect(assets.pages[0]).toMatchObject({ id: "p1", details: ["@mitienda", "Tienda"] });
    expect(assets.pixelsByAccount.act_3[0]).toMatchObject({ id: "x2", details: ["Último evento hace 2 h", "Tiendas SpA"] });
  });
});

describe("formato de los datos de Meta", () => {
  it("respeta las monedas sin decimales", () => {
    expect(formatSpent("1250000", "CLP")).toBe("Gastado $1.250.000");
    expect(formatSpent("12345", "USD")).toContain("123");
    expect(formatSpent("0", "USD")).toBe("Sin gasto aún");
    expect(formatSpent(undefined, "USD")).toBeNull();
  });

  it("dice hace cuánto", () => {
    expect(ago("2026-09-23T11:30:00Z", now)).toBe("hace 30 min");
    expect(ago("2026-09-20T12:00:00Z", now)).toBe("hace 3 días");
    expect(ago(undefined, now)).toBeNull();
  });
});
