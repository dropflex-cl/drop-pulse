import { describe, expect, it } from "vitest";
import { cleanWhatsapp, deliveryDays, EMPTY_POLICIES, fromRow, logisticsMetafield, policiesMetafield, policyProblems, toRow } from "./policies";

const full = {
  ...EMPTY_POLICIES,
  freeShippingThreshold: 29990,
  returnDays: 30,
  warrantyMonths: 6,
  whatsapp: "56912345678",
  handlingDays: 1,
  transitDaysMin: 2,
  transitDaysMax: 4,
  cutoffHour: 14,
};

describe("envíos y políticas", () => {
  it("sin datos no promete nada: solo el pago al recibir y el envío gratis", () => {
    expect(policiesMetafield(EMPTY_POLICIES)).toEqual({ cod: true, free_shipping: true });
    expect(logisticsMetafield(EMPTY_POLICIES, "America/Santiago")).toBeNull();
    expect(deliveryDays(EMPTY_POLICIES)).toBeNull();
  });

  it("publica el contrato de SHARED_METAFIELDS", () => {
    expect(policiesMetafield(full)).toEqual({ cod: true, free_shipping: true, free_shipping_threshold: 29990, return_days: 30, warranty_months: 6, whatsapp: "56912345678" });
    expect(logisticsMetafield(full, "America/Santiago")).toEqual({
      handling_days: 1,
      transit_days_min: 2,
      transit_days_max: 4,
      cutoff_hour: 14,
      timezone: "America/Santiago",
      business_days_only: true,
      saturday_delivery: false,
      saturday_dispatch: false,
      holidays: [],
    });
    expect(deliveryDays(full)).toEqual({ min: 3, max: 5 });
  });

  it("sin envío gratis no publica el monto", () => {
    expect(policiesMetafield({ ...full, freeShipping: false })).not.toHaveProperty("free_shipping_threshold");
    expect(toRow({ ...full, freeShipping: false }).free_shipping_threshold).toBeNull();
  });

  it("con plazo de regiones: el máximo general cubre regiones y la ciudad lleva el suyo", () => {
    const stgo = { ...full, handlingDays: 0, transitDaysMin: 0, transitDaysMax: 1, cutoffHour: 9, saturdayDispatch: true, saturdayDelivery: true, mainCity: "Santiago", regionsExtraDays: 2 };
    expect(logisticsMetafield(stgo, "America/Santiago")).toMatchObject({
      handling_days: 0,
      transit_days_min: 0,
      transit_days_max: 3,
      cutoff_hour: 9,
      saturday_dispatch: true,
      saturday_delivery: true,
      main_city: "Santiago",
      main_city_transit_max: 1,
      regions_extra_days: 2,
    });
    expect(deliveryDays(stgo)).toEqual({ min: 0, max: 3 });
    // Sin ciudad no se publica el plazo de regiones (y no se puede guardar).
    expect(logisticsMetafield({ ...stgo, mainCity: null }, null)).not.toHaveProperty("regions_extra_days");
    expect(policyProblems({ ...stgo, mainCity: null }).mainCity).toBeTruthy();
    expect(policyProblems({ ...stgo, regionsExtraDays: 0 }).regionsExtraDays).toBeTruthy();
    expect(fromRow(toRow(stgo))).toEqual(stgo);
  });

  it("marca lo que no se puede guardar", () => {
    expect(policyProblems(full)).toEqual({});
    expect(policyProblems({ ...full, transitDaysMin: 5, transitDaysMax: 2 })).toHaveProperty("transitDaysMax");
    expect(policyProblems({ ...full, transitDaysMax: null })).toHaveProperty("transitDaysMax");
    expect(policyProblems({ ...full, cutoffHour: 24 })).toHaveProperty("cutoffHour");
    expect(policyProblems({ ...full, returnDays: 1.5 })).toHaveProperty("returnDays");
    expect(policyProblems({ ...full, whatsapp: "123" })).toHaveProperty("whatsapp");
  });

  it("limpia el WhatsApp y vuelve de la fila igual", () => {
    expect(cleanWhatsapp("+56 9 1234 5678")).toBe("56912345678");
    expect(cleanWhatsapp("  ")).toBeNull();
    expect(fromRow({ ...toRow(full), return_days: "30" })).toEqual(full);
  });
});
