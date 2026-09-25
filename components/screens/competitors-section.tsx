"use client";

import { useEffect, useState } from "react";
import { Button, Field, StateChip, notify } from "@/components/df";
import { money } from "@/lib/format";
import { ProductApiClientError, productsApi } from "@/lib/products/client";
import type { CompetitorView } from "@/lib/types";

// «Tiendas de la competencia» en Información base (docs/spec-angulos-testeo.md › §3.2): el
// comerciante pega hasta 7 links; el servidor lee cada página y resume cómo vende. La pantalla
// sondea mientras alguna se está analizando.

const POLL_MS = 2500;
const HELP =
  "Pega los links de tiendas que ya venden este producto (de la biblioteca de anuncios de Meta, por ejemplo). Los usamos para proponerte ángulos que la competencia no está usando.";

const busy = (c: CompetitorView) => c.status === "queued" || c.status === "running";

function Status({ c }: { c: CompetitorView }) {
  if (busy(c)) return <StateChip label="Analizando" icon="loader" tone="progress" spin size="sm" />;
  if (c.status === "succeeded") return <StateChip label="Listo" icon="check" tone="success" size="sm" />;
  return <StateChip label="No se pudo" icon="alert" tone="danger" size="sm" />;
}

function Row({ c, currency, working, onRemove, onRetry }: { c: CompetitorView; currency: string; working: boolean; onRemove: () => void; onRetry: () => void }) {
  const a = c.analysis;
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-row">{a?.storeName || c.host}</p>
          <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-caption text-primary underline-offset-2 hover:underline">
            {c.host}
            <span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        </div>
        <Status c={c} />
      </div>
      {a ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
          {a.price !== undefined ? (
            <>
              <dt className="text-muted-foreground">Precio</dt>
              <dd className="tabular-nums">
                {money(a.price, currency)}
                {a.compareAt !== undefined ? <s className="ml-2 text-muted-foreground">{money(a.compareAt, currency)}</s> : null}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Ángulo</dt>
          <dd>{a.painOrDesire}</dd>
          <dt className="text-muted-foreground">Forma</dt>
          <dd>{a.frameName}</dd>
        </dl>
      ) : null}
      {c.status === "failed" && c.error ? <p className="text-label font-normal text-destructive">{c.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {c.status === "failed" ? (
          <Button size="sm" icon="refresh" onClick={onRetry} disabled={working}>
            Reintentar
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" icon="x" onClick={onRemove} disabled={working}>
          Quitar
        </Button>
      </div>
    </li>
  );
}

export function CompetitorsSection({ productId, currency, initial, max = 7 }: { productId: string; currency: string; initial: CompetitorView[]; max?: number }) {
  const [list, setList] = useState(initial);
  const [limit, setLimit] = useState(max);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState<string>();

  const analyzing = list.some(busy);
  const full = list.length >= limit;

  useEffect(() => {
    if (!analyzing) return;
    const t = window.setInterval(async () => {
      try {
        const res = await productsApi.competitors(productId);
        setList(res.competitors);
        setLimit(res.max);
      } catch {
        // Un sondeo fallido no cambia nada: se intenta en el siguiente.
      }
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [analyzing, productId]);

  const add = async () => {
    setAdding(true);
    setError(undefined);
    try {
      const res = await productsApi.addCompetitor(productId, url);
      setList(res.competitors);
      setLimit(res.max);
      setUrl("");
    } catch (e) {
      setError(e instanceof ProductApiClientError ? e.message : "No pudimos agregar la tienda. Intenta de nuevo.");
    } finally {
      setAdding(false);
    }
  };

  const act = async (c: CompetitorView, action: "remove" | "retry") => {
    setWorking(c.id);
    try {
      const res = action === "remove" ? await productsApi.removeCompetitor(productId, c.id) : await productsApi.retryCompetitor(productId, c.id);
      setList(res.competitors);
      setLimit(res.max);
      if (action === "remove") notify(`Quitaste ${c.analysis?.storeName || c.host}`);
    } catch (e) {
      notify(e instanceof ProductApiClientError ? e.message : "No pudimos guardar el cambio. Intenta de nuevo.");
    } finally {
      setWorking(undefined);
    }
  };

  return (
    <section aria-labelledby="competencia" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="competencia" className="text-heading">
          Tiendas de la competencia
        </h2>
        <span className="text-caption text-muted-foreground tabular-nums">
          {list.length} de {limit}
        </span>
      </div>
      <p className="text-label font-normal text-muted-foreground">{HELP}</p>

      {full ? (
        <p className="rounded-md bg-muted p-3 text-label font-normal">Ya tienes {limit} tiendas, el máximo. Quita una para agregar otra.</p>
      ) : (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void add();
          }}
        >
          <Field
            label="Link de la tienda"
            value={url}
            onValueChange={(v) => {
              setUrl(v);
              setError(undefined);
            }}
            placeholder="https://tienda.com/products/…"
            inputMode="url"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "competencia-error" : undefined}
            className="flex-1"
          />
          <Button type="submit" icon="plus" loading={adding} disabled={!url.trim()}>
            Agregar
          </Button>
        </form>
      )}
      {error ? (
        <p id="competencia-error" role="alert" className="-mt-1 text-caption text-destructive">
          {error}
        </p>
      ) : null}

      {list.length ? (
        <ul aria-live="polite" className="flex flex-col divide-y border-t pt-3">
          {list.map((c) => (
            <Row key={c.id} c={c} currency={currency} working={working === c.id} onRemove={() => act(c, "remove")} onRetry={() => act(c, "retry")} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
