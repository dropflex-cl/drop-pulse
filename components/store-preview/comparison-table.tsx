import { fill } from "@/lib/store-preview/facts";
import { px, settingsOf } from "@/lib/store-preview/settings";
import { DfIcon } from "./primitives";
import type { PreviewProps } from "./types";

// sections/df-comparison-table.liquid + snippets/df-comparison-table-cell.liquid, con el contenido
// del metafield: la tabla con nuestra columna destacada, la leyenda de «Parcial» si hay alguno y la
// nota al pie. Sin el latido (JS opcional, apagado por defecto).

type Cell = "yes" | "no" | "partial" | { text?: string };

interface Row {
  feature?: string;
  us?: Cell;
  others?: Cell[];
}

interface Content {
  heading?: string;
  us_label?: string;
  other_labels?: string[];
  rows?: Row[];
  footnote?: string;
}

type Value = "yes" | "no" | "partial" | "text";

/** Como el Liquid: un { text } con texto es «text»; cualquier otro objeto cae en el `else` (Parcial). */
function cellValue(cell: Cell | undefined): { value: Value; text: string } {
  if (cell && typeof cell === "object") return cell.text ? { value: "text", text: cell.text } : { value: "partial", text: "" };
  if (cell === "yes" || cell === "no") return { value: cell, text: "" };
  return { value: "partial", text: "" };
}

/** snippets/df-comparison-table-cell.liquid: un «text» vacío o un valor desconocido es Parcial. */
function CellMark({ value, text }: { value: Value; text: string }) {
  const v = value === "text" && !text ? "partial" : value;
  switch (v) {
    case "yes":
      return (
        <>
          <span className="df-comparison-table__mark df-comparison-table__mark--yes">
            <DfIcon name="check-circle" />
          </span>
          <span className="df-visually-hidden">Sí</span>
        </>
      );
    case "no":
      return (
        <>
          <span className="df-comparison-table__mark df-comparison-table__mark--no">
            <DfIcon name="x-circle" />
          </span>
          <span className="df-visually-hidden">No</span>
        </>
      );
    case "text":
      return <span className="df-comparison-table__value">{text}</span>;
    default:
      return (
        <>
          <span className="df-comparison-table__mark df-comparison-table__mark--partial" aria-hidden />
          <span className="df-visually-hidden">Parcial</span>
        </>
      );
  }
}

export function ComparisonTablePreview({ content, facts }: PreviewProps<Content>) {
  const s = settingsOf("comparison-table");
  const rowsIn = content.rows ?? [];
  // Con filas del metafield, los títulos salen de él (los del editor solo como respaldo de heading y us_label).
  const heading = fill(content.heading || String(s.heading ?? ""), facts);
  // En la tienda el último respaldo es el nombre de la tienda, que la vista previa no tiene.
  const usLabel = fill(content.us_label || String(s.us_label ?? "") || "Nuestra tienda", facts);
  const o1Label = fill(content.other_labels?.[0], facts);
  const o2Label = fill(content.other_labels?.[1], facts);
  const cols = o2Label ? 2 : 1;

  // Sin etiqueta de la competencia no hay filas (como el Liquid). Una fila con un token sin llenar se omite.
  const rows = o1Label
    ? rowsIn.slice(0, 8).flatMap((row) => {
        const us = cellValue(row.us);
        const o1 = cellValue(row.others?.[0]);
        const o2 = cellValue(row.others?.[1]);
        const texts = [row.feature, us.text, o1.text, o2.text].map((t) => fill(t, facts));
        if (!texts[0] || texts.some((t) => t.includes("{"))) return [];
        return [{ feature: texts[0], us: { ...us, text: texts[1] }, o1: { ...o1, text: texts[2] }, o2: { ...o2, text: texts[3] } }];
      })
    : [];
  if (!rows.length) return null;

  const shown = (c: { value: Value; text: string }) => (c.value === "text" && !c.text ? "partial" : c.value);
  const hasPartial = rows.some((r) => [r.us, r.o1, ...(cols === 2 ? [r.o2] : [])].some((c) => shown(c) === "partial"));
  const footnote = fill(content.footnote, facts);

  return (
    <df-comparison-table
      className={`df df-comparison-table${s.red_crosses ? " df-comparison-table--red-crosses" : ""}${s.pulse ? " df-comparison-table--pulse" : ""}`}
      style={{ paddingBlock: `${px(s.padding_top)} ${px(s.padding_bottom)}` }}
    >
      <div className="df-comparison-table__inner">
        {heading ? (
          <h2 className={`df-heading df-comparison-table__heading${s.heading_italic ? " df-comparison-table__heading--italic" : ""}`}>{heading}</h2>
        ) : null}

        <div className={`df-comparison-table__scroll df-comparison-table__scroll--cols-${cols}`}>
          <table className="df-comparison-table__table">
            <thead>
              <tr>
                <td className="df-comparison-table__corner">
                  <span className="df-visually-hidden">Característica</span>
                </td>
                <th scope="col" className="df-comparison-table__us df-comparison-table__us--head">
                  {usLabel}
                </th>
                <th scope="col" className="df-comparison-table__other df-comparison-table__other--head">
                  {o1Label}
                </th>
                {cols === 2 ? (
                  <th scope="col" className="df-comparison-table__other df-comparison-table__other--head">
                    {o2Label}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="df-comparison-table__row">
                  <th scope="row" className="df-comparison-table__feature">
                    {r.feature}
                  </th>
                  <td className="df-comparison-table__us">
                    <CellMark {...r.us} />
                  </td>
                  <td className="df-comparison-table__other">
                    <CellMark {...r.o1} />
                  </td>
                  {cols === 2 ? (
                    <td className="df-comparison-table__other">
                      <CellMark {...r.o2} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasPartial || footnote ? (
          <div className="df-comparison-table__notes">
            {hasPartial ? (
              <p className="df-comparison-table__legend">
                <span className="df-comparison-table__mark df-comparison-table__mark--partial" aria-hidden />
                Parcial: solo en algunos casos o modelos.
              </p>
            ) : null}
            {footnote ? <p className="df-text df-comparison-table__footnote">{footnote}</p> : null}
          </div>
        ) : null}
      </div>
    </df-comparison-table>
  );
}
