import { textsOf } from "./page-schema";

/** El ID de un fact no autoriza inventar una cita ni agregar un plazo a ese fact. */
export function pdpProofProblems(
  component: string,
  content: unknown,
  usableFacts: Map<string, string>,
): string[] {
  const problems: string[] = [];
  const normalize = (s: string) =>
    s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}.${i}`));
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (typeof row.fact_id === "string") {
      const evidence = usableFacts.get(row.fact_id);
      if (!evidence)
        problems.push(
          `${component}.${path}.fact_id: usa un hecho aprobado, verificado y utilizable de este producto.`,
        );
      else {
        const text = normalize(evidence);
        if (component === "expert-endorsement")
          for (const key of ["name", "credential", "quote"]) {
            if (
              typeof row[key] === "string" &&
              !text.includes(normalize(row[key]))
            )
              problems.push(
                `${component}.${path}.${key}: la identidad, credencial y declaración literal deben estar documentadas en el hecho elegido.`,
              );
          }
        if (["results-timeline", "before-after"].includes(component)) {
          const known = new Set(
            [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) =>
              m[0].replace(",", "."),
            ),
          );
          for (const field of textsOf(row).filter(
            (t) => t.path !== "fact_id",
          )) {
            const claims = [...field.text.matchAll(/\d+(?:[.,]\d+)?/g)].map(
              (m) => m[0].replace(",", "."),
            );
            if (claims.some((n) => !known.has(n)))
              problems.push(
                `${component}.${path}.${field.path}: ese plazo o resultado numérico no está documentado en el hecho elegido.`,
              );
          }
        }
      }
    }
    for (const [key, child] of Object.entries(row))
      if (child && typeof child === "object")
        walk(child, path ? `${path}.${key}` : key);
  };
  walk(content, "content");
  return problems;
}
