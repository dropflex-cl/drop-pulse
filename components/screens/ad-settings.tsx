"use client";

import { useEffect, useState } from "react";
import { Button, Field, notify } from "@/components/df";
import { AdsApiError, adsApi } from "@/lib/ads/client";
import { presetLabel } from "@/lib/ads/presets";
import { amount, currencySymbol, money, parseMoney } from "@/lib/format";
import type { AdTemplate } from "@/lib/types";

// Ajustes › Campañas (docs/spec-anuncios.md §4.2 y §7.4): el tope de gasto diario de la cuenta (ningún
// lanzamiento lo supera) y las plantillas propias. Borrar una plantilla no toca las campañas que la
// usaron: cada campaña tiene su copia.

const errorText = (e: unknown, fallback: string) => (e instanceof AdsApiError ? e.message : fallback);

export function AdSettings({ spendCap, currency, templates: initial }: { spendCap: number | null; currency: string; templates: AdTemplate[] }) {
  const [cap, setCap] = useState(spendCap ? amount(spendCap, currency) : "");
  const [saved, setSaved] = useState(spendCap);
  const [templates, setTemplates] = useState(initial);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, "No pudimos guardar el cambio."));
    } finally {
      setBusy(null);
    }
  }

  const capValue = parseMoney(cap);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Tope de gasto diario de tu cuenta"
          prefix={currencySymbol(currency)}
          inputMode="numeric"
          value={cap}
          onValueChange={setCap}
          hint={saved ? `Hoy: ${money(saved, currency)}/día. Ningún lanzamiento lo supera.` : "Obligatorio antes de tu primer lanzamiento. Ningún lanzamiento lo supera."}
          className="min-w-48 flex-1"
        />
        <Button
          variant="primary"
          icon="check"
          loading={busy === "cap"}
          disabled={!Number.isFinite(capValue) || capValue <= 0 || capValue === saved}
          onClick={() =>
            run("cap", async () => {
              await adsApi.saveSpendCap(capValue);
              setSaved(capValue);
              notify(`Tope diario: ${money(capValue, currency)}`);
            })
          }
        >
          Guardar tope
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-row font-semibold">Plantillas de campaña</h3>
        {templates.length ? (
          <ul className="m-0 flex list-none flex-col divide-y overflow-hidden rounded-md border p-0">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                {renaming?.id === t.id ? (
                  <div className="flex w-full flex-wrap items-end gap-2">
                    <Field label="Nombre" value={renaming.name} maxLength={60} onValueChange={(name) => setRenaming({ id: t.id, name })} className="min-w-48 flex-1" autoFocus />
                    <Button variant="ghost" onClick={() => setRenaming(null)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      loading={busy === `rename-${t.id}`}
                      disabled={!renaming.name.trim()}
                      onClick={() =>
                        run(`rename-${t.id}`, async () => {
                          const { template } = await adsApi.renameTemplate(t.id, renaming.name);
                          setTemplates((l) => l.map((x) => (x.id === t.id ? template : x)));
                          setRenaming(null);
                        })
                      }
                    >
                      Guardar
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-small font-medium">{t.name}</div>
                      <div className="text-caption text-muted-foreground">
                        {t.structure.toUpperCase()}
                        {t.basedOn ? ` · a partir de ${presetLabel(t.basedOn)}` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setRenaming({ id: t.id, name: t.name })}>
                      Renombrar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `dup-${t.id}`}
                      onClick={() =>
                        run(`dup-${t.id}`, async () => {
                          const { template } = await adsApi.duplicateTemplate(t.id);
                          setTemplates((l) => [...l, template]);
                        })
                      }
                    >
                      Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant={armed === t.id ? "destructive" : "ghost"}
                      aria-live="polite"
                      loading={busy === `del-${t.id}`}
                      onClick={() =>
                        armed === t.id
                          ? run(`del-${t.id}`, async () => {
                              await adsApi.deleteTemplate(t.id);
                              setTemplates((l) => l.filter((x) => x.id !== t.id));
                              setArmed(null);
                              notify(`Plantilla borrada: ${t.name}`);
                            })
                          : setArmed(t.id)
                      }
                    >
                      {armed === t.id ? "Confirmar: borrar" : "Borrar"}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-label font-normal text-muted-foreground">Todavía no guardas plantillas. En el configurador, cambia una y toca «Guardar como plantilla».</p>
        )}
      </div>
      {error ? (
        <p role="alert" className="m-0 text-label font-normal text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
