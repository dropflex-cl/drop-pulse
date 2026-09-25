"use client";

import { useState } from "react";
import { Button, Icon, StatusBadge, notify } from "@/components/df";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import type { DifferentiatorView } from "@/lib/types";
import { cn } from "@/lib/utils";

// «Diferenciador» en Información base (docs/spec-angulos-testeo.md › §3.1): la ficha lo propone y el
// comerciante lo confirma o lo edita. Sin él, los ángulos salen a ciegas.

const fieldArea =
  "min-h-touch w-full resize-y rounded-md border border-input bg-background p-3 text-heading leading-6 font-normal text-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft aria-invalid:border-destructive";

function Area({ id, label, hint, value, onChange, rows, error }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; rows: number; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-ayuda`}
        className={fieldArea}
      />
      <span id={`${id}-ayuda`} className={cn("text-caption", error ? "text-destructive" : "text-muted-foreground")}>
        {error ?? hint}
      </span>
    </div>
  );
}

export function DifferentiatorSection({ productId, initial }: { productId: string; initial: DifferentiatorView }) {
  const [state, setState] = useState(initial);
  const start = state.value;
  const [editing, setEditing] = useState(!state.confirmed);
  const [versus, setVersus] = useState(start?.versus ?? "");
  const [claim, setClaim] = useState(start?.claim ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string }>();

  const proposal = state.proposed;
  const changed = versus.trim() !== (start?.versus ?? "") || claim.trim() !== (start?.claim ?? "");
  // Sin cambios sobre la propuesta es «Confirmar»; con cambios (o ya confirmado), «Guardar».
  const label = !state.confirmed && !changed && start ? "Confirmar diferenciador" : "Guardar";

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      // El respaldo solo se conserva si el texto sigue siendo el de la propuesta.
      const basis = !changed ? (start?.basis ?? "") : "";
      const next = await productsApi.saveDifferentiator(productId, { versus: versus.trim(), claim: claim.trim(), basis });
      setState(next);
      setVersus(next.value?.versus ?? "");
      setClaim(next.value?.claim ?? "");
      setEditing(false);
      notify("Diferenciador confirmado");
    } catch (e) {
      setError(e instanceof ProductApiClientError ? { field: e.field, message: e.message } : { message: "No pudimos guardar. Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setVersus(state.value?.versus ?? "");
    setClaim(state.value?.claim ?? "");
    setError(undefined);
    setEditing(false);
  };

  return (
    <section aria-labelledby="diferenciador" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="diferenciador" className="text-heading">
            Diferenciador
          </h2>
          <p className="mt-0.5 text-label font-normal text-muted-foreground">
            {start ? "En qué se diferencia tu producto de lo que tu cliente ya usa." : "¿En qué se diferencia tu producto de lo que tu cliente ya usa?"}
          </p>
        </div>
        {state.confirmed ? <StatusBadge status="aprobado" label="Confirmado" size="sm" /> : start ? <StatusBadge status="revision" label="Por confirmar" size="sm" /> : null}
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {!start ? (
            <p className="flex gap-2 rounded-md bg-muted p-3 text-label font-normal">
              <Icon name="sparkle" size="sm" className="mt-px flex-none" />
              <span>
                {state.oldBrief
                  ? "Tu ficha es de antes del diferenciador, así que la IA no lo propuso. Escríbelo tú: los ángulos y la página parten de aquí."
                  : "La IA no encontró una diferencia que se pueda sostener con tu información. Escríbela tú: los ángulos parten de aquí."}
              </span>
            </p>
          ) : null}
          <Area
            id="diferenciador-versus"
            label="Contra qué"
            hint="Lo que tu cliente usa hoy, como categoría y sin marcas. Por ejemplo: su crema hidratante."
            value={versus}
            onChange={setVersus}
            rows={1}
            error={error?.field === "versus" ? error.message : undefined}
          />
          <Area
            id="diferenciador-claim"
            label="La diferencia"
            hint="En una frase que puedas sostener con lo que sabes del producto."
            value={claim}
            onChange={setClaim}
            rows={4}
            error={error?.field === "claim" || error?.field === "basis" ? error.message : undefined}
          />
          {error && !error.field ? (
            <p role="alert" className="text-label font-normal text-destructive">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" icon="check" loading={saving} disabled={!versus.trim() || !claim.trim()}>
              {label}
            </Button>
            {state.confirmed ? (
              <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>
                Cancelar
              </Button>
            ) : proposal && changed ? (
              <Button
                type="button"
                variant="ghost"
                icon="undo"
                onClick={() => {
                  setVersus(proposal.versus);
                  setClaim(proposal.claim);
                  setError(undefined);
                }}
                disabled={saving}
              >
                Volver a la propuesta
              </Button>
            ) : null}
          </div>
        </form>
      ) : state.value ? (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 rounded-md bg-muted p-3">
            <div>
              <dt className="text-caption text-muted-foreground">Contra qué</dt>
              <dd className="text-body">{state.value.versus}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">La diferencia</dt>
              <dd className="text-body">{state.value.claim}</dd>
            </div>
          </dl>
          <div>
            <Button icon="edit" onClick={() => setEditing(true)}>
              Editar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
