"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SegmentedControl } from "@/components/df";
import { money, multiplier } from "@/lib/format";
import type { AdHourPoint, AdSeriesPoint } from "@/lib/types";

// Gráficos de evolución (docs/spec-anuncios.md §6.2), con los tokens chart-1…5: la serie en chart-1,
// ayer y el límite en gris y punteados. El color no es la única señal: la leyenda nombra cada serie y
// el límite va rotulado.

type MetricKey = "cpa" | "purchases" | "spend" | "ctr" | "cpc" | "cpm" | "roas";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "cpa", label: "Costo por venta" },
  { key: "purchases", label: "Ventas" },
  { key: "spend", label: "Gasto" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
  { key: "roas", label: "Retorno" },
];

const RANGES = [
  { value: "7", label: "7 días" },
  { value: "14", label: "14" },
  { value: "30", label: "30" },
  { value: "all", label: "Todo" },
];

const axis = { fontSize: 12, fill: "var(--muted-foreground)" };

function fmt(key: MetricKey, v: number | null, currency: string): string {
  if (v == null) return "—";
  if (key === "purchases") return v.toLocaleString("es-CL");
  if (key === "ctr") return `${v.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`;
  if (key === "roas") return multiplier(v);
  return money(v, currency);
}

const dayLabel = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}`;

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string | null }[];
  title: (label: string | number | undefined) => string;
  value: (v: number | null) => string;
}

/** El detalle al tocar un punto, con los colores de la tarjeta (sin estilos sueltos). */
function Tip({ active, label, payload, title, value }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-caption text-foreground shadow-md">
      <div className="font-medium">{title(label)}</div>
      {payload.map((p) => (
        <div key={p.name} className="tabular-nums">
          {p.name}: {value(typeof p.value === "number" ? p.value : null)}
        </div>
      ))}
    </div>
  );
}

export function DailyChart({ series, units, cpaLimit, currency }: { series: Record<string, AdSeriesPoint[]>; units: { id: string; name: string }[]; cpaLimit: number; currency: string }) {
  const [metric, setMetric] = useState<MetricKey>("cpa");
  const [range, setRange] = useState("14");
  const [unit, setUnit] = useState("campaign");
  const data = useMemo(() => {
    const all = series[unit] ?? [];
    return range === "all" ? all : all.slice(-Number(range));
  }, [series, unit, range]);
  const label = METRICS.find((m) => m.key === metric)!.label;
  const unitName = unit === "campaign" ? "Campaña" : (units.find((u) => u.id === unit)?.name ?? "");

  return (
    <section aria-labelledby="evolucion" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="evolucion" className="text-heading">
          Evolución diaria
        </h2>
        <SegmentedControl label="Periodo" value={range} onChange={setRange} options={RANGES} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">
          Métrica
          <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="h-control cursor-pointer rounded-md border border-input bg-background px-3 text-body text-foreground">
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">
          De
          <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-control cursor-pointer rounded-md border border-input bg-background px-3 text-body text-foreground">
            <option value="campaign">Campaña</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {data.length ? (
        <>
          <div className="h-56 w-full" role="img" aria-label={`${label} por día de ${unitName}${metric === "cpa" ? `, con tu límite de ${money(cpaLimit, currency)}` : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dayLabel} tick={axis} stroke="var(--border)" />
                <YAxis tick={axis} stroke="var(--border)" width={64} tickFormatter={(v: number) => fmt(metric, v, currency)} />
                <Tooltip content={<Tip title={(d) => dayLabel(String(d))} value={(v) => fmt(metric, v, currency)} />} />
                {metric === "cpa" ? <ReferenceLine y={cpaLimit} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Límite", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 12 }} /> : null}
                <Line type="monotone" dataKey={metric} name={label} stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-1" />
              {label}
            </span>
            {metric === "cpa" ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-4 border-t-2 border-dashed border-muted-foreground" />
                Tu límite: {money(cpaLimit, currency)}
              </span>
            ) : null}
          </p>
        </>
      ) : (
        <p className="m-0 text-label font-normal text-muted-foreground">Todavía no hay días con datos. La primera lectura llega en menos de una hora después de publicar.</p>
      )}
    </section>
  );
}

export function HourlyChart({ today, yesterday, currency }: { today: AdHourPoint[]; yesterday: AdHourPoint[]; currency: string }) {
  const data = useMemo(() => {
    const hours = new Map<number, { hour: number; today?: number; yesterday?: number }>();
    for (const p of yesterday) hours.set(p.hour, { hour: p.hour, yesterday: p.spend });
    for (const p of today) hours.set(p.hour, { ...(hours.get(p.hour) ?? { hour: p.hour }), today: p.spend });
    return [...hours.values()].sort((a, b) => a.hour - b.hour);
  }, [today, yesterday]);
  const last = today.at(-1);
  const same = last ? yesterday.find((p) => p.hour === last.hour) : undefined;

  return (
    <section aria-labelledby="hoy-hora" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <h2 id="hoy-hora" className="text-heading">
          Hoy, hora a hora
        </h2>
        <p className="m-0 text-caption text-muted-foreground">
          {last
            ? `A las ${last.hour}:00 llevas ${money(last.spend, currency)} y ${last.purchases === 1 ? "1 venta" : `${last.purchases} ventas`}${same ? `; ayer a esa hora, ${money(same.spend, currency)} y ${same.purchases === 1 ? "1 venta" : `${same.purchases} ventas`}` : ""}.`
            : "Sin lecturas de hoy todavía."}
        </p>
      </div>
      {data.length ? (
        <>
          <div className="h-44 w-full" role="img" aria-label="Gasto acumulado de hoy frente a ayer, por hora">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}h`} tick={axis} stroke="var(--border)" />
                <YAxis tick={axis} stroke="var(--border)" width={64} tickFormatter={(v: number) => money(v, currency)} />
                <Tooltip content={<Tip title={(h) => `${h}:00`} value={(v) => money(v ?? 0, currency)} />} />
                <Line type="monotone" dataKey="yesterday" name="Ayer" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="today" name="Hoy" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="m-0 flex gap-4 text-caption text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-1" />
              Hoy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="w-4 border-t-2 border-dashed border-muted-foreground" />
              Ayer
            </span>
          </p>
        </>
      ) : null}
    </section>
  );
}
