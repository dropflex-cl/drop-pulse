import { isEmptyContent } from "@/lib/copy/page-schema";
import { contentVariants } from "@/lib/copy/variants";
import { componentById } from "@/lib/shopify/components/catalog";
import { componentCapability } from "./component-capabilities";
import { usageRestrictions, type IntelligenceGraph } from "./graph";
import type {
  AnglePersuasionPlan,
  LandingExperience,
  PersuasionIssue,
} from "./persuasion-schemas";
import type { Strategy } from "./schemas";

export interface PersuasionValidationContext {
  strategy: Strategy;
  graph: IntelligenceGraph;
  assets: { source: string; id: string; slot?: string; selected?: boolean }[];
  review_ids: string[];
  review_count: number;
  rows: {
    component: string;
    status: string;
    enabled: boolean;
    content: unknown;
    images?: { slot: string; source: string; id: string }[];
  }[];
}
export function validatePersuasionPlan(
  plan: AnglePersuasionPlan,
  context: PersuasionValidationContext,
): PersuasionIssue[] {
  const issues: PersuasionIssue[] = [];
  const add = (
    code: string,
    field: string,
    message: string,
    severity: "error" | "warning" = "error",
    section_key?: string,
  ) => {
    issues.push({
      code,
      field,
      message,
      severity,
      ...(section_key ? { section_key } : {}),
    });
  };
  const snapshot = context.strategy.snapshot;
  const angle = snapshot.angles.find((a) => a.id === plan.angle_id);
  if (plan.strategy_id !== context.strategy.id || !angle)
    add(
      "invalid_reference",
      "angle_id",
      "El ángulo no forma parte de esta estrategia.",
    );
  if (angle?.persona_id !== plan.audience_state.persona_id)
    add(
      "invalid_reference",
      "audience_state.persona_id",
      "Usa la persona del ángulo seleccionado.",
    );
  if (
    context.strategy.readiness.stale ||
    context.strategy.readiness.needs_review ||
    context.strategy.state !== "selected"
  )
    add(
      "stale_strategy",
      "strategy_id",
      "Revisa la estrategia y sus dependencias antes de aprobar el plan.",
    );
  const lookup = (
    kind: keyof IntelligenceGraph,
    references: string[],
    field: string,
  ) => {
    for (const id of references) {
      const row = context.graph[kind].find((r) => r.value.id === id)?.value;
      if (!row || ("lifecycle" in row && row.lifecycle !== "active"))
        add(
          "invalid_reference",
          field,
          "Una referencia no está activa en este producto.",
        );
      else if (
        "persona_id" in row &&
        row.persona_id !== plan.audience_state.persona_id
      )
        add(
          "invalid_reference",
          field,
          "Una referencia corresponde a otra persona.",
        );
    }
  };
  const audience = plan.audience_state;
  lookup("persona", [audience.persona_id], "audience_state.persona_id");
  lookup("jtbd", audience.primary_jtbd_ids, "audience_state.primary_jtbd_ids");
  lookup("pain", audience.primary_pain_ids, "audience_state.primary_pain_ids");
  lookup(
    "desire",
    audience.primary_desire_ids,
    "audience_state.primary_desire_ids",
  );
  lookup(
    "objection",
    audience.primary_objection_ids,
    "audience_state.primary_objection_ids",
  );
  const restricted = new Set(
    usageRestrictions(context.graph).map((r) => r.fact_id),
  );
  const references = (
    item: { fact_ids: string[]; evidence_ids: string[] },
    field: string,
  ) => {
    lookup("Fact", item.fact_ids, `${field}.fact_ids`);
    lookup("EvidenceLink", item.evidence_ids, `${field}.evidence_ids`);
    for (const id of item.evidence_ids) {
      const link = context.graph.EvidenceLink.find(
        (r) => r.value.id === id,
      )?.value;
      if (link && !item.fact_ids.includes(link.fact_id))
        add(
          "unbound_evidence",
          `${field}.evidence_ids`,
          "La evidencia debe respaldar uno de los facts declarados.",
        );
    }
  };
  references(
    {
      fact_ids: [
        ...plan.thesis.promise_fact_ids,
        ...plan.thesis.mechanism_fact_ids,
      ],
      evidence_ids: [],
    },
    "thesis",
  );
  const duplicate = (values: string[], field: string) => {
    if (new Set(values).size !== values.length)
      add("duplicate_key", field, "No repitas identidades dentro del plan.");
  };
  duplicate(
    plan.beliefs.map((b) => b.key),
    "beliefs",
  );
  duplicate(
    plan.sections.map((s) => s.section_key),
    "sections",
  );
  duplicate(
    plan.claims.map((c) => c.key),
    "claims",
  );
  const budget = plan.attention_budget;
  if (
    plan.sections.filter((s) => s.kind === "primary").length >
      budget.max_primary_sections ||
    plan.sections.filter((s) => s.kind === "support").length >
      budget.max_support_sections
  )
    add(
      "attention_budget",
      "sections",
      "Reduce la página al presupuesto de secciones aprobado.",
    );
  if (
    plan.sections[0]?.selected_component !== "listing" ||
    plan.sections.filter((s) => s.selected_component === "listing").length !== 1
  )
    add(
      "hero_required",
      "sections",
      "Conserva una sola ficha comercial al inicio de la página.",
    );
  duplicate(
    plan.sections.map((s) => s.selected_component),
    "sections.selected_component",
  );
  let copyRun = 0,
    bodyStarted = false;
  const jobs = new Set<string>();
  for (const [index, section] of plan.sections.entries()) {
    const field = `sections.${index}`,
      capability = componentCapability(section.selected_component);
    references(section, field);
    if (!capability?.supported_jobs.includes(section.primary_job))
      add(
        "component_job",
        `${field}.selected_component`,
        "Este componente no resuelve el objetivo principal elegido.",
        "error",
        section.section_key,
      );
    if (!section.candidate_components.includes(section.selected_component))
      add(
        "component_candidate",
        field,
        "El componente elegido debe estar entre los candidatos.",
      );
    if (capability?.placement === "body") bodyStarted = true;
    else if (bodyStarted)
      add(
        "runtime_placement",
        field,
        "Las piezas de la ficha comercial deben preceder al cuerpo de la página.",
      );
    if (
      section.selected_component !== "listing" &&
      capability?.placement === "hero" &&
      section.kind !== "support"
    )
      add(
        "hero_support",
        field,
        "Esta pieza es apoyo de la ficha, no un bloque principal.",
      );
    if (section.cta !== "none" && !capability?.supports_cta)
      add(
        "unsupported_cta",
        field,
        "El componente no incluye un control de compra. Usa el contexto del CTA de la ficha.",
      );
    if (
      section.secondary_jobs.includes(section.primary_job) ||
      new Set(section.secondary_jobs).size !== section.secondary_jobs.length
    )
      add(
        "duplicate_job",
        field,
        "No repitas el objetivo principal entre los secundarios.",
      );
    if (jobs.has(section.primary_job) && !section.redundancy_justification)
      add(
        "redundant_job",
        field,
        "Explica qué creencia nueva resuelve o elimina esta sección.",
      );
    jobs.add(section.primary_job);
    if (
      !section.belief_keys.length ||
      section.belief_keys.some((k) => !plan.beliefs.some((b) => b.key === k))
    )
      add(
        "belief_binding",
        field,
        "Vincula cada sección a creencias del recorrido mínimo.",
      );
    const uniqueContribution = section.belief_keys.some(
      (k) =>
        !plan.sections.some((s) => s !== section && s.belief_keys.includes(k)),
    );
    if (!uniqueContribution && !section.redundancy_justification)
      add(
        "removable_section",
        field,
        "Al eliminar esta sección no queda una creencia sin resolver. Elimínala o justifica su contribución.",
        "error",
        section.section_key,
      );
    if (section.claim_keys.some((k) => !plan.claims.some((c) => c.key === k)))
      add(
        "claim_binding",
        field,
        "La sección referencia un claim que no existe.",
      );
    copyRun =
      section.preferred_medium === "copy_led" ||
      capability?.copy_density === "medium"
        ? copyRun + 1
        : 0;
    if (copyRun > 2)
      add(
        "copy_sequence",
        field,
        "Evita más de dos secciones de alta densidad consecutivas.",
      );
    if (
      section.message.headline_intent.length > budget.max_headline_chars ||
      (section.message.body_intent?.length ?? 0) >
        budget.max_body_chars_per_section
    )
      add(
        "copy_budget",
        field,
        "Comprime el mensaje al presupuesto de atención.",
      );
    for (const asset of section.source_asset_refs) {
      if (
        !context.assets.some(
          (a) => a.source === asset.source && a.id === asset.id,
        )
      )
        add(
          "invalid_reference",
          `${field}.source_asset_refs`,
          "El asset no está disponible en este producto.",
        );
      if (asset.source === "ugc" && asset.role === "proof")
        add(
          "synthetic_proof",
          `${field}.source_asset_refs`,
          "El UGC generado puede demostrar el producto, pero no acredita una experiencia real de un comprador.",
        );
    }
    const empty = context.rows.some(
      (r) =>
        r.component === section.selected_component &&
        contentVariants(r.content).every((v) => isEmptyContent(v.content)),
    );
    const minReviews = empty
      ? 0
      : (componentById(section.selected_component)?.minReviews ?? 0);
    if (context.review_count < minReviews)
      add(
        "missing_proof",
        field,
        "Aprueba suficientes reseñas reales antes de usar este componente.",
      );
    if (
      !empty &&
      section.selected_component === "inventory" &&
      !section.claim_keys.some((k) =>
        plan.claims.some((c) => c.key === k && c.type === "scarcity"),
      )
    )
      add(
        "inventory_claim",
        field,
        "Declara y respalda la disponibilidad real; no crees escasez.",
      );
  }
  for (const [i, belief] of plan.beliefs.entries()) {
    references(belief, `beliefs.${i}`);
    lookup("objection", belief.objection_ids, `beliefs.${i}.objection_ids`);
    const section = plan.sections.find(
      (s) => s.section_key === belief.resolution_section_key,
    );
    if (!section?.belief_keys.includes(belief.key))
      add(
        "belief_coverage",
        `beliefs.${i}`,
        "La creencia debe tener una resolución explícita, incluso si es microcopy o FAQ.",
      );
  }
  for (const id of audience.primary_objection_ids)
    if (!plan.beliefs.some((b) => b.objection_ids.includes(id)))
      add(
        "objection_coverage",
        "beliefs",
        "Resuelve las objeciones priorizadas mediante una creencia del recorrido.",
      );
  for (const [i, claim] of plan.claims.entries()) {
    const field = `claims.${i}`;
    references(claim, field);
    if (claim.fact_ids.some((id) => restricted.has(id)))
      add(
        "restricted_claim",
        field,
        "El claim usa un fact sin verificar/aprobar o con contradicciones.",
      );
    const supporting = claim.evidence_ids.filter((id) => {
      const e = context.graph.EvidenceLink.find(
        (r) => r.value.id === id,
      )?.value;
      return e?.relation === "supports" && claim.fact_ids.includes(e.fact_id);
    });
    if (claim.type === "testimonial") {
      if (
        !claim.review_ids.length ||
        claim.review_ids.some((id) => !context.review_ids.includes(id))
      )
        add(
          "synthetic_testimonial",
          field,
          "Un testimonio requiere una reseña real aprobada; el lenguaje sintético y UGC generado no son reseñas.",
        );
    } else if (!claim.fact_ids.length || !supporting.length)
      add(
        "claim_evidence",
        field,
        "Vincula la afirmación a facts utilizables y evidencia explícita que los respalde.",
      );
    if (
      ["clinical", "performance", "comparative", "timeline"].includes(
        claim.type,
      )
    )
      add(
        "claim_scope_review",
        field,
        "La existencia de evidencia no demuestra el alcance de este claim. Documenta la revisión humana del alcance en las restricciones.",
        claim.restrictions.length ? "warning" : "error",
      );
    if (!plan.sections.some((s) => s.claim_keys.includes(claim.key)))
      add(
        "unused_claim",
        field,
        "Elimina los claims que ninguna sección utiliza.",
        "warning",
      );
  }
  const visual = plan.sections.filter(
    (s) =>
      s.kind === "primary" &&
      ["visual_led", "proof_led", "commerce_led"].includes(s.preferred_medium),
  ).length;
  const primary = plan.sections.filter((s) => s.kind === "primary").length;
  if (primary && visual / primary < budget.preferred_visual_ratio)
    add(
      "visual_ratio",
      "sections",
      "Prioriza demostración, prueba o comparación para reducir la carga de lectura.",
      "warning",
    );
  return issues.slice(0, 100);
}

export function validateLandingExperience(
  experience: LandingExperience,
  plan: AnglePersuasionPlan,
  planRevision: number,
  context: PersuasionValidationContext,
): PersuasionIssue[] {
  const issues = validatePersuasionPlan(plan, context);
  const add = (code: string, field: string, message: string) =>
    issues.push({ code, field, message, severity: "error" });
  if (
    experience.strategy_id !== plan.strategy_id ||
    experience.angle_id !== plan.angle_id ||
    experience.landing_angle_id !== plan.landing_angle_id ||
    experience.plan_revision !== planRevision
  )
    add(
      "plan_binding",
      "persuasion_plan_id",
      "La experiencia debe usar la identidad y revisión exactas del plan.",
    );
  if (experience.status === "active" && plan.status !== "approved")
    add(
      "plan_approval",
      "status",
      "Aprueba el plan antes de activar la experiencia.",
    );
  const enabled = experience.sections.filter((s) => s.enabled);
  if (enabled[0]?.component !== "listing")
    add(
      "hero_required",
      "sections",
      "Conserva la ficha al inicio de la experiencia.",
    );
  if (
    new Set(experience.sections.map((s) => s.section_key)).size !==
      experience.sections.length ||
    new Set(experience.sections.map((s) => s.component)).size !==
      experience.sections.length
  )
    add(
      "duplicate_key",
      "sections",
      "No repitas secciones ni componentes en una experiencia.",
    );
  let bodyStarted = false;
  for (const section of enabled) {
    const planned = plan.sections.find(
      (s) => s.section_key === section.section_key,
    );
    const capability = componentCapability(section.component);
    if (capability?.placement === "body") bodyStarted = true;
    else if (bodyStarted)
      add(
        "runtime_placement",
        section.section_key,
        "Mantén los apoyos comerciales junto al hero.",
      );
    if (
      !planned ||
      section.persuasion_job !== planned.primary_job ||
      !capability?.supported_jobs.includes(section.persuasion_job) ||
      section.belief_keys.some((k) => !planned.belief_keys.includes(k))
    )
      add(
        "section_binding",
        section.section_key,
        "La sección debe conservar el objetivo y las creencias del plan.",
      );
    const row = context.rows.find((r) => r.component === section.component);
    const variant = row
      ? contentVariants(row.content).find(
          (v) => v.key === section.content_variant_key,
        )
      : undefined;
    if (!variant)
      add(
        "content_binding",
        section.section_key,
        "Guarda la variante de contenido que necesita esta sección.",
      );
    if (
      variant &&
      variant.angle_id &&
      (variant.angle_id !== experience.landing_angle_id ||
        (variant.hook_id !== null &&
          variant.hook_id !== experience.landing_hook_id))
    )
      add(
        "selector_binding",
        section.section_key,
        "La variante pertenece a otro ángulo o gancho público.",
      );
    if (
      experience.status === "active" &&
      (!row?.enabled || !["approved", "published"].includes(row.status))
    )
      add(
        "content_approval",
        section.section_key,
        "Aprueba y habilita el contenido antes de activar la experiencia.",
      );
    for (const pick of section.images)
      if (
        !context.assets.some(
          (a) => a.source === pick.source && a.id === pick.id,
        ) ||
        !componentById(section.component)?.imageSlots?.some(
          (s) => s.key === pick.slot,
        )
      )
        add(
          "invalid_reference",
          section.section_key,
          "La imagen no pertenece a un espacio disponible del componente.",
        );
    for (const asset of section.asset_refs) {
      if (
        !context.assets.some(
          (a) => a.source === asset.source && a.id === asset.id,
        )
      )
        add(
          "invalid_reference",
          section.section_key,
          "El asset no está disponible en este producto.",
        );
      if (asset.source === "ugc" && asset.role === "proof")
        add(
          "synthetic_proof",
          section.section_key,
          "El UGC generado no es una reseña real ni evidencia de resultados.",
        );
    }
    if (
      variant &&
      section.images.length &&
      JSON.stringify(section.images) !== JSON.stringify(variant.images ?? [])
    )
      add(
        "asset_binding",
        section.section_key,
        "Guarda las imágenes en la variante del componente con el editor existente antes de vincularlas.",
      );
    if (experience.status === "active" && !isEmptyContent(variant?.content)) {
      const picks = variant?.images ?? row?.images ?? [];
      for (const slot of componentById(section.component)?.imageSlots ?? []) {
        if (slot.key === "videos") {
          const scripts =
            (variant?.content as { script_ids?: string[] })?.script_ids ?? [];
          if (
            scripts.length < slot.min ||
            scripts.some(
              (id) =>
                !context.assets.some((a) => a.source === "ugc" && a.id === id),
            )
          )
            add(
              "missing_asset",
              section.section_key,
              "Vincula videos finales aprobados antes de activar.",
            );
        } else if (slot.key === "gifs") {
          const count =
            picks.filter((p) => p.slot === slot.key).length ||
            context.assets.filter(
              (a) =>
                a.source === "page_image" && a.slot === "gifs" && a.selected,
            ).length;
          if (count < slot.min)
            add(
              "missing_asset",
              section.section_key,
              "Genera o elige las animaciones del componente antes de activar.",
            );
        } else if (picks.filter((p) => p.slot === slot.key).length < slot.min)
          add(
            "missing_asset",
            section.section_key,
            "Elige los medios requeridos por el componente antes de activar.",
          );
      }
    }
    if (variant)
      issues.push(
        ...contentAttentionIssues(
          section.section_key,
          section.component,
          variant.content,
          plan.attention_budget,
        ),
      );
  }
  for (const belief of plan.beliefs.filter((b) => b.mandatory))
    if (
      !enabled.some(
        (s) =>
          s.belief_keys.includes(belief.key) &&
          s.section_key === belief.resolution_section_key,
      )
    )
      add(
        "belief_coverage",
        belief.key,
        "Un override dejó una creencia obligatoria sin resolver.",
      );
  const primaryCount = enabled.filter(
    (s) =>
      plan.sections.find((p) => p.section_key === s.section_key)?.kind ===
      "primary",
  ).length;
  const supportCount = enabled.length - primaryCount;
  if (
    primaryCount > plan.attention_budget.max_primary_sections ||
    supportCount > plan.attention_budget.max_support_sections
  )
    add(
      "attention_budget",
      "sections",
      "La experiencia supera el presupuesto del plan.",
    );
  return issues.slice(0, 100);
}

/** Cuenta copy visible, excluyendo SEO, IDs, estilos e iconos del contrato. */
export function contentAttentionIssues(
  sectionKey: string,
  component: string,
  content: unknown,
  budget: AnglePersuasionPlan["attention_budget"],
): PersuasionIssue[] {
  const issues: PersuasionIssue[] = [];
  let bodyChars = 0;
  const add = (field: string, message: string) =>
    issues.push({
      code: "copy_budget",
      field: `${sectionKey}.${field}`,
      section_key: sectionKey,
      message,
      severity: "error" as const,
    });
  const walk = (value: unknown, path: string, field: string) => {
    if (
      /^(seo_|short_name$|icon$|.*_ids$|id$|kind$|color$|style$|highlight$|fact_id$|state$)/.test(
        field,
      )
    )
      return;
    if (typeof value === "string") {
      if (/^(title|heading|headline)$/.test(field)) {
        if (value.length > budget.max_headline_chars)
          add(path, "Acorta el titular.");
      } else if (field === "short_description") {
        if (value.length > budget.max_subheadline_chars)
          add(path, "Acorta la bajada del hero.");
      } else bodyChars += value.length;
    } else if (Array.isArray(value)) {
      // Las tablas y tarjetas conservan su cardinalidad nativa (4–6); su copy total sigue acotado.
      if (
        ["bullets", "moments", "items", "faqs"].includes(field) &&
        value.length > budget.max_bullets_per_section
      )
        add(path, "Reduce las ideas visibles en esta sección.");
      value.forEach((v, i) => walk(v, `${path}.${i}`, field));
    } else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, k);
  };
  walk(content, "content", "");
  if (bodyChars > budget.max_body_chars_per_section)
    add(
      "content",
      `Comprime el texto de ${component} al presupuesto del plan.`,
    );
  return issues;
}
