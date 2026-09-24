"use client";

import { useState } from "react";
import { Button, Field, Icon, notify } from "@/components/df";
import { ACCENT_PALETTE, MIN_CONTRAST, WHITE, accentCheck, normalizeHex } from "@/lib/copy/accent";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import { cn } from "@/lib/utils";

// «Color de la página» (etapa Textos): el acento de los botones y detalles de la tienda. Una paleta de
// colores sólidos con contraste AA (lib/copy/accent.ts) o uno elegido a mano. Se guarda al elegir, en
// hex; los colores son datos del comerciante, por eso van en `style` y no como clases.

const ratio = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}:1`;

export function PageAccent({
  productId,
  initial,
  onSaved,
  className,
}: {
  productId: string;
  initial: string | null;
  /** El color quedó guardado (la vista previa de la página lo usa). */
  onSaved?: (hex: string) => void;
  className?: string;
}) {
  const [saved, setSaved] = useState<string | null>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const inPalette = (hex: string | null) => !!hex && ACCENT_PALETTE.some((c) => c.hex === hex);
  const [custom, setCustom] = useState(Boolean(initial && !inPalette(initial)));
  const [draft, setDraft] = useState(initial && !inPalette(initial) ? initial : "");

  const current = saving ?? saved;
  const draftHex = normalizeHex(draft);
  const preview = custom && draftHex ? draftHex : current;
  const check = preview ? accentCheck(preview) : null;
  const name = (hex: string) => ACCENT_PALETTE.find((c) => c.hex === hex)?.name ?? hex;

  const save = async (hex: string) => {
    if (hex === saved) return;
    setSaving(hex);
    setError(undefined);
    try {
      const { accent } = await productsApi.saveAccent(productId, hex);
      setSaved(accent);
      onSaved?.(accent);
      notify(`Color de la página: ${name(accent)}`);
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : "No pudimos guardar el color. Intenta de nuevo.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-labelledby="color-pagina" className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <div>
        <h2 id="color-pagina" className="text-heading">
          Color de la página
        </h2>
        <p className="text-label font-normal text-muted-foreground">El color de los botones y los detalles de tu tienda. Todos se leen bien con su texto encima.</p>
      </div>

      <div role="radiogroup" aria-label="Color de la página" className="grid grid-cols-[repeat(auto-fill,minmax(--spacing(11),1fr))] gap-2">
        {ACCENT_PALETTE.map((c) => {
          const selected = !custom && current === c.hex;
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${c.name} (${c.hex})`}
              title={c.name}
              disabled={!!saving}
              onClick={() => {
                setCustom(false);
                save(c.hex);
              }}
              style={{ backgroundColor: c.hex, color: accentCheck(c.hex).onAccent }}
              className={cn(
                "grid aspect-square min-h-touch cursor-pointer place-items-center rounded-md inset-ring inset-ring-border transition-[box-shadow] duration-fast ease-standard disabled:cursor-default",
                selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
              )}
            >
              {selected ? <Icon name={saving === c.hex ? "loader" : "check"} strokeWidth={2.5} className={saving === c.hex ? "animate-df-spin" : undefined} /> : null}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          aria-label="Otro color"
          title="Otro color"
          onClick={() => setCustom(true)}
          style={custom && draftHex ? { backgroundColor: draftHex, color: accentCheck(draftHex).onAccent } : undefined}
          className={cn(
            "grid aspect-square min-h-touch cursor-pointer place-items-center rounded-md border border-dashed border-input text-muted-foreground",
            custom && "border-solid ring-2 ring-foreground ring-offset-2 ring-offset-card",
          )}
        >
          <Icon name="plus" />
        </button>
      </div>

      {custom ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-h-touch cursor-pointer items-center gap-2 text-label">
            <input
              type="color"
              aria-label="Elegir el color en la paleta del sistema"
              value={draftHex ?? current ?? ACCENT_PALETTE[0].hex}
              onChange={(e) => setDraft(e.target.value)}
              className="size-touch cursor-pointer rounded-md border bg-transparent p-0.5"
            />
            Elegir
          </label>
          <Field
            label="Hex"
            value={draft}
            onValueChange={setDraft}
            placeholder={ACCENT_PALETTE[0].hex}
            maxLength={7}
            spellCheck={false}
            autoCapitalize="off"
            error={draft && !draftHex ? `Escribe 6 dígitos hex, por ejemplo ${ACCENT_PALETTE[0].hex}.` : undefined}
            className="w-36"
          />
          <Button variant="primary" icon="check" disabled={!draftHex || draftHex === saved} loading={!!saving && saving === draftHex} onClick={() => draftHex && save(draftHex)}>
            Usar este color
          </Button>
        </div>
      ) : null}

      {preview && check ? (
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            style={{ backgroundColor: preview, color: check.onAccent }}
            className="inline-flex h-control items-center rounded-md px-4 text-row"
          >
            Comprar · Paga al recibir
          </span>
          <p className="min-w-0 flex-1 text-caption text-muted-foreground">
            {name(preview)} · contraste {ratio(check.buttonRatio)} con texto {check.onAccent === WHITE ? "blanco" : "negro"}
            {check.buttonRatio >= MIN_CONTRAST ? " (cumple AA)" : ""}
            {preview === saved ? " · guardado" : ""}
          </p>
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">Todavía no eliges un color: toca uno para guardarlo.</p>
      )}

      {check && !check.ok ? (
        <p className="flex items-start gap-1.5 rounded-sm bg-warning-soft px-2 py-1.5 text-label font-normal text-warning">
          <Icon name="alert" size="sm" strokeWidth={2} className="mt-px" />
          <span>
            Sobre fondo blanco se lee poco ({ratio(check.onWhiteRatio)}): sirve para botones, pero no para enlaces ni textos. Prueba uno más oscuro.
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-label font-normal text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
