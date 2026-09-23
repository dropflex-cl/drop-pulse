"use client";

import { useMemo, useState } from "react";
import { Button, Field, Icon } from "@/components/df";
import { amount, currencySymbol, fractionDigits, money, parseAmount, percent } from "@/lib/format";
import { roundingFor, suggestCompareAtPrice } from "@/lib/pricing/calculator";
import { buildPricingPlan, suggestPrices, validatePricingForm, type PricingForm } from "@/lib/pricing/plan";
import { productsApi, ProductApiClientError } from "@/lib/products/client";
import type { SavedPricingDto } from "@/lib/types";
import { cn } from "@/lib/utils";

// “Precio y packs” (Información base): la calculadora de dropflex v1. Requisito para “Optimizar con
// IA”: la ficha y el cliente ideal leen estos números. Todo se recalcula mientras escribes; el
// servidor vuelve a calcular al guardar.

type Key = keyof PricingForm;
type Texts = Record<Key, string>;

const MONEY_KEYS: Key[] = ["unitCost", "avgShippingCost", "purchaseCostLimit", "salePrice", "compareAtPrice"];

function toTexts(v: Partial<PricingForm>, currency: string): Texts {
  const t = (k: Key) => {
    const x = v[k];
    if (x == null || !Number.isFinite(x)) return "";
    return MONEY_KEYS.includes(k) ? amount(x, currency) : String(x);
  };
  return {
    unitCost: t("unitCost"),
    avgShippingCost: t("avgShippingCost"),
    purchaseCostLimit: t("purchaseCostLimit"),
    confirmationRate: t("confirmationRate"),
    deliveryRate: t("deliveryRate"),
    salePrice: t("salePrice"),
    compareAtPrice: t("compareAtPrice"),
    extraUnitDiscount: t("extraUnitDiscount"),
  };
}

function toForm(t: Texts, currency: string): PricingForm {
  const m = (s: string) => parseAmount(s, currency);
  const r = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : NaN);
  return {
    unitCost: m(t.unitCost),
    avgShippingCost: m(t.avgShippingCost),
    purchaseCostLimit: m(t.purchaseCostLimit),
    confirmationRate: r(t.confirmationRate),
    deliveryRate: r(t.deliveryRate),
    salePrice: m(t.salePrice),
    compareAtPrice: t.compareAtPrice.trim() ? m(t.compareAtPrice) : null,
    extraUnitDiscount: r(t.extraUnitDiscount),
  };
}

export function PricingSection({
  productId,
  currency,
  saved,
  defaults,
  onSaved,
}: {
  productId: string;
  currency: string;
  saved?: SavedPricingDto;
  defaults: Partial<PricingForm>;
  onSaved: (pricing: SavedPricingDto) => void;
}) {
  const [texts, setTexts] = useState<Texts>(() => toTexts(saved ?? defaults, currency));
  // Como en v1: el precio y el tachado siguen al recomendado hasta que el comerciante los toca.
  const [priceTouched, setPriceTouched] = useState(Boolean(saved));
  const [compareTouched, setCompareTouched] = useState(Boolean(saved));
  const [savedTexts, setSavedTexts] = useState<Texts | null>(() => (saved ? toTexts(saved, currency) : null));
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<{ field?: string; message: string }>();

  const form = toForm(texts, currency);
  const suggestion = suggestPrices(form, currency);
  // Precio y tachado efectivos: los escritos o, si no se tocaron, los sugeridos. El tachado sugerido
  // sale del precio de venta vigente (+30 %, redondo), como en v1.
  const salePrice = priceTouched ? form.salePrice : (suggestion?.recommendedPrice ?? NaN);
  const autoCompare = salePrice > 0 ? suggestCompareAtPrice(salePrice, undefined, roundingFor(currency)) : null;
  const effective: PricingForm = { ...form, salePrice, compareAtPrice: compareTouched ? form.compareAtPrice : autoCompare };
  const errors = validatePricingForm(effective);
  const plan = useMemo(() => buildPricingPlan(effective, currency), [JSON.stringify(effective), currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownTexts: Texts = {
    ...texts,
    salePrice: priceTouched ? texts.salePrice : suggestion ? amount(suggestion.recommendedPrice, currency) : "",
    compareAtPrice: compareTouched ? texts.compareAtPrice : autoCompare ? amount(autoCompare, currency) : "",
  };
  const dirty = !savedTexts || JSON.stringify(savedTexts) !== JSON.stringify(shownTexts);

  const set = (k: Key) => (v: string) => {
    if (k === "salePrice") setPriceTouched(v.trim() !== "");
    if (k === "compareAtPrice") setCompareTouched(true);
    // Punto de miles mientras escribe (24990 → 24.990); con decimales (USD, PEN…) se deja como va.
    const reformat = MONEY_KEYS.includes(k) && fractionDigits(currency) === 0;
    const n = reformat ? parseAmount(v, currency) : NaN;
    setTexts((t) => ({ ...t, [k]: reformat ? (Number.isNaN(n) ? "" : amount(n, currency)) : v.replace(/[^\d.,]/g, "") }));
    setServerError(undefined);
  };

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    setServerError(undefined);
    try {
      const { pricing } = await productsApi.savePricing(productId, effective);
      const t = toTexts(pricing, currency);
      setTexts(t);
      setSavedTexts(t);
      setPriceTouched(true);
      setCompareTouched(true);
      onSaved(pricing);
    } catch (e) {
      setServerError({
        field: e instanceof ProductApiClientError ? e.field : undefined,
        message: e instanceof Error ? e.message : "No pudimos guardar el precio. Intenta de nuevo.",
      });
    } finally {
      setSaving(false);
    }
  };

  const sym = currencySymbol(currency);
  // Un campo vacío no se marca en rojo hasta que se escribe algo: el botón ya dice que falta.
  const err = (k: Key) => (serverError?.field === k ? serverError.message : shownTexts[k] ? errors[k] : undefined);
  const m = (v: number) => money(v, currency);

  return (
    <section aria-labelledby="precio-packs" className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="precio-packs" className="text-heading">
          Precio y packs
        </h2>
        <span className={cn("inline-flex items-center gap-1 text-caption", dirty ? "text-muted-foreground" : "text-success")}>
          {dirty ? (savedTexts ? "Cambios sin guardar" : "Sin guardar") : (
            <>
              <Icon name="check" size="sm" />
              Guardado
            </>
          )}
        </span>
      </div>
      <p className="mt-0.5 text-label font-normal text-muted-foreground">La IA escribe la ficha y el cliente ideal para este precio y estos packs.</p>

      <h3 className="mt-4 text-label text-muted-foreground">Tus costos</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Field label="Costo en el proveedor" prefix={sym} inputMode="numeric" value={texts.unitCost} onValueChange={set("unitCost")} error={err("unitCost")} />
        <Field label="Envío por pedido" prefix={sym} inputMode="numeric" value={texts.avgShippingCost} onValueChange={set("avgShippingCost")} error={err("avgShippingCost")} />
        <Field label="Anuncios por pedido" prefix={sym} inputMode="numeric" value={texts.purchaseCostLimit} onValueChange={set("purchaseCostLimit")} error={err("purchaseCostLimit")} hint="CPA objetivo" />
        <Field label="Pedidos confirmados" suffix="%" inputMode="decimal" value={texts.confirmationRate} onValueChange={set("confirmationRate")} error={err("confirmationRate")} />
        <Field label="Confirmados entregados" suffix="%" inputMode="decimal" value={texts.deliveryRate} onValueChange={set("deliveryRate")} error={err("deliveryRate")} />
      </div>

      {suggestion ? (
        <p className="mt-3 text-small text-muted-foreground">
          Equilibrio <span className="text-foreground tabular-nums">{m(suggestion.minimumPrice)}</span> · recomendado{" "}
          <span className="font-semibold text-foreground tabular-nums">{m(suggestion.recommendedPrice)}</span>
        </p>
      ) : null}

      <h3 className="mt-4 text-label text-muted-foreground">Tu oferta</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Field
          label="Precio de venta"
          prefix={sym}
          inputMode="numeric"
          value={shownTexts.salePrice}
          onValueChange={set("salePrice")}
          error={err("salePrice")}
          ai={!priceTouched && Boolean(suggestion)}
          hint={!priceTouched && suggestion ? "El recomendado" : undefined}
        />
        <Field
          label="Precio tachado"
          prefix={sym}
          inputMode="numeric"
          value={shownTexts.compareAtPrice}
          onValueChange={set("compareAtPrice")}
          error={err("compareAtPrice")}
          hint={plan?.discountPercent != null ? `${plan.discountPercent}% de descuento` : "Opcional"}
        />
        <Field label="Descuento por unidad extra" suffix="%" inputMode="numeric" value={texts.extraUnitDiscount} onValueChange={set("extraUnitDiscount")} error={err("extraUnitDiscount")} hint="En los packs" />
      </div>

      {plan ? (
        <>
          <p className="mt-3 text-small">
            Ganas{" "}
            <span className={cn("font-semibold tabular-nums", plan.profit < 0 ? "text-destructive" : "text-foreground")}>{m(plan.profit)}</span> por pedido
            entregado <span className="text-muted-foreground tabular-nums">({percent(plan.margin * 100)})</span>
            {plan.maxCpa != null ? (
              <span className="text-muted-foreground">
                {" "}
                · puedes pagar hasta <span className="tabular-nums">{m(plan.maxCpa)}</span> en anuncios por pedido
              </span>
            ) : null}
          </p>
          <ul aria-label="Packs" className="mt-3 divide-y rounded-md border">
            {plan.packs.map((p) => (
              <li key={p.units} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2.5">
                <span className="text-row">
                  {p.units === 1 ? "1 unidad" : `Pack ${p.units} unidades`}
                  {p.units > 1 && p.savingsRate > 0 ? (
                    <span className="ml-1.5 text-caption text-muted-foreground tabular-nums">−{Math.round(p.savingsRate * 100)}% c/u</span>
                  ) : null}
                </span>
                <span className="text-row font-semibold tabular-nums">{m(p.price)}</span>
                <span className={cn("w-full text-caption tabular-nums", p.earnsMoreThanPrevious ? "text-muted-foreground" : "text-warning")}>
                  {p.earnsMoreThanPrevious
                    ? `Ganas ${m(p.profit)}${p.units > 1 ? ` · ${m(p.perUnitPrice)} c/u` : ""}`
                    : `Ganas ${m(p.profit)}: no gana más que el anterior, baja el descuento`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {serverError && !serverError.field ? (
        <p role="alert" className="mt-3 text-label font-normal text-destructive">
          {serverError.message}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button icon="check" loading={saving} disabled={!plan || !dirty} onClick={save}>
          {savedTexts ? "Guardar cambios" : "Guardar precio"}
        </Button>
      </div>
    </section>
  );
}
