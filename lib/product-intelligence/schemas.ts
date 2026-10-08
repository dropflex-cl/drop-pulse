import { shopifyAutomationInputs, shopifyAutomationOutputs } from "./shopify-automation-schemas";
import { visualInputSchemas, visualOutputs } from "./visual-schemas";
import { persuasionInputSchemas, persuasionOutputs } from "./persuasion-schemas";
import { galleryGenerationInputs, galleryGenerationOutputs } from "./gallery-generation-schemas";
import { learningInputSchemas, learningOutputs } from "./learning-schemas";
import { contentInputSchemas, contentOutputs } from "./content-schemas";
// Contratos canónicos del dominio PI. Sin I/O, cookies ni proveedores.
// El JSON Schema se exporta desde estos tipos; las reglas del grafo se validan
// sobre el estado final en graph.ts, no con lecturas externas en el parser.
import { z } from "zod";
import { listProductsInput, listProductsOutput } from "./product-list-schemas";
import { getPackLabelsInput, savePackLabelsInput, packLabelsOutputs } from "./pack-labels-schemas";
import { getUgcInput, saveUgcInput, getUgcMontageInput, ugcOutputs } from "./ugc-schemas";
import { getLandingInput, saveLandingInput, landingOutputs } from "./landing-schemas";

function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
function uniqueItems(value: readonly unknown[]): boolean {
  return new Set(value.map((item) => JSON.stringify(item))).size === value.length;
}
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const refSchema = z.union([z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })
}), z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$"))
})]);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([z.union([z.string(), z.number(), z.boolean(), z.null()]), z.array(jsonValueSchema).min(0).max(100), z.record(z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")), jsonValueSchema).refine((value) => Object.keys(value).length <= 100, "Demasiados campos.").meta({ maxProperties: 100 })]));

export const warningSchema = z.strictObject({
  "code": z.string().min(1).max(80),
  "message": z.string().min(1).max(8192),
  "field": z.union([z.string().min(1).max(256), z.null()])
});

export const errorSchema = z.strictObject({
  "code": z.enum(["VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN", "INVALID_REFERENCE", "DEPENDENCY_IN_USE", "REVISION_CONFLICT", "ARTIFACT_CONFLICT", "IDEMPOTENCY_KEY_REUSED", "PAYLOAD_TOO_LARGE", "RESPONSE_TOO_LARGE", "SCHEMA_VERSION_UNSUPPORTED", "RATE_LIMITED", "CURSOR_EXPIRED", "CURSOR_INVALID", "EXECUTION_NOT_READY", "INTEGRATION_NOT_CONNECTED", "GENERATION_IN_PROGRESS", "PROVIDER_RECONCILIATION_REQUIRED", "INTERNAL_ERROR"]),
  "message": z.string().min(1).max(8192),
  "retryable": z.boolean(),
  "details": z.strictObject({
  "expected_revision": z.number().int().min(0).max(9007199254740991).optional(),
  "current_revision": z.number().int().min(0).max(9007199254740991).optional(),
  "expected_artifact_etag": z.string().regex(new RegExp("^[0-9a-f]{64}$")).optional(),
  "current_artifact_etag": z.string().regex(new RegExp("^[0-9a-f]{64}$")).optional(),
  "missing_fields": z.array(z.string().min(1).max(256)).min(0).max(100).optional(),
  "fields": z.array(z.string().min(1).max(256)).min(0).max(100).optional(),
  "reference": z.string().min(1).max(256).optional(),
  "operation_index": z.number().int().min(0).max(49).optional(),
  "retry_after_seconds": z.number().int().min(0).max(9007199254740991).optional(),
  "operation_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }).optional(),
  "max_bytes": z.number().int().min(1).max(9007199254740991).optional(),
  "next_action": z.string().min(1).max(8192).optional()
})
});

export const generationGuidanceSchema = z.strictObject({
  "central_message": z.string().min(1).max(8192).optional(),
  "hook_delivery": z.enum(["confiding", "intrigued", "surprised", "indignant", "deadpan", "playful"]).optional(),
  "opening_shot": z.enum(["selfie_talk", "pov_hands", "problem_scene", "product_in_place", "mirror", "real_footage"]).optional(),
  "first_motion": z.string().min(1).max(8192).optional(),
  "spoken_hook": z.string().min(1).max(8192).optional(),
  "screen_hook": z.string().min(1).max(8192).optional(),
  "follow_up": z.string().min(1).max(8192).optional(),
  "objection_refs": z.array(refSchema).min(0).max(100).optional(),
  "proof_fact_refs": z.array(refSchema).min(0).max(100).optional(),
  "ugc_notes": z.string().min(1).max(8192).optional(),
  "landing_notes": z.string().min(1).max(8192).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const magnitudeSchema = z.strictObject({
  "value": z.string().min(1).max(8192),
  "basis_type": z.enum(["subjective", "observed"]),
  "source_ref": z.union([refSchema, z.null()])
});

export const personaCreateSchema = z.strictObject({
  "name": z.string().min(1).max(160),
  "situation": z.string().min(1).max(8192),
  "trigger": z.string().min(1).max(8192),
  "context": z.string().min(1).max(8192),
  "purchase_criteria": z.array(z.string().min(1).max(8192)).min(1).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
});

export const personaChangesSchema = z.strictObject({
  "name": z.string().min(1).max(160).optional(),
  "situation": z.string().min(1).max(8192).optional(),
  "trigger": z.string().min(1).max(8192).optional(),
  "context": z.string().min(1).max(8192).optional(),
  "purchase_criteria": z.array(z.string().min(1).max(8192)).min(1).max(100).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const personaUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "name": z.string().min(1).max(160),
  "situation": z.string().min(1).max(8192),
  "trigger": z.string().min(1).max(8192),
  "context": z.string().min(1).max(8192),
  "purchase_criteria": z.array(z.string().min(1).max(8192)).min(1).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "name": z.string().min(1).max(160).optional(),
  "situation": z.string().min(1).max(8192).optional(),
  "trigger": z.string().min(1).max(8192).optional(),
  "context": z.string().min(1).max(8192).optional(),
  "purchase_criteria": z.array(z.string().min(1).max(8192)).min(1).max(100).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const personaRecordSchema = z.strictObject({
  "name": z.string().min(1).max(160),
  "situation": z.string().min(1).max(8192),
  "trigger": z.string().min(1).max(8192),
  "context": z.string().min(1).max(8192),
  "purchase_criteria": z.array(z.string().min(1).max(8192)).min(1).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]),
  "evidence": z.array(z.strictObject({
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const jtbdCreateSchema = z.strictObject({
  "persona_ref": refSchema,
  "circumstance": z.string().min(1).max(8192),
  "desired_progress": z.string().min(1).max(8192),
  "outcome": z.string().min(1).max(8192),
  "dimension": z.enum(["functional", "emotional", "social"]),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
});

export const jtbdChangesSchema = z.strictObject({
  "persona_ref": refSchema.optional(),
  "circumstance": z.string().min(1).max(8192).optional(),
  "desired_progress": z.string().min(1).max(8192).optional(),
  "outcome": z.string().min(1).max(8192).optional(),
  "dimension": z.enum(["functional", "emotional", "social"]).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const jtbdUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "persona_ref": refSchema,
  "circumstance": z.string().min(1).max(8192),
  "desired_progress": z.string().min(1).max(8192),
  "outcome": z.string().min(1).max(8192),
  "dimension": z.enum(["functional", "emotional", "social"]),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "persona_ref": refSchema.optional(),
  "circumstance": z.string().min(1).max(8192).optional(),
  "desired_progress": z.string().min(1).max(8192).optional(),
  "outcome": z.string().min(1).max(8192).optional(),
  "dimension": z.enum(["functional", "emotional", "social"]).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const jtbdRecordSchema = z.strictObject({
  "persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "circumstance": z.string().min(1).max(8192),
  "desired_progress": z.string().min(1).max(8192),
  "outcome": z.string().min(1).max(8192),
  "dimension": z.enum(["functional", "emotional", "social"]),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]),
  "evidence": z.array(z.strictObject({
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const painCreateSchema = z.strictObject({
  "persona_ref": refSchema,
  "description": z.string().min(1).max(8192),
  "frequency": z.union([magnitudeSchema, z.null()]).optional(),
  "severity": z.union([magnitudeSchema, z.null()]).optional(),
  "basis": z.string().min(1).max(8192),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
});

export const painChangesSchema = z.strictObject({
  "persona_ref": refSchema.optional(),
  "description": z.string().min(1).max(8192).optional(),
  "frequency": z.union([magnitudeSchema, z.null()]).optional(),
  "severity": z.union([magnitudeSchema, z.null()]).optional(),
  "basis": z.string().min(1).max(8192).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const painUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "persona_ref": refSchema,
  "description": z.string().min(1).max(8192),
  "frequency": z.union([magnitudeSchema, z.null()]).optional(),
  "severity": z.union([magnitudeSchema, z.null()]).optional(),
  "basis": z.string().min(1).max(8192),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "persona_ref": refSchema.optional(),
  "description": z.string().min(1).max(8192).optional(),
  "frequency": z.union([magnitudeSchema, z.null()]).optional(),
  "severity": z.union([magnitudeSchema, z.null()]).optional(),
  "basis": z.string().min(1).max(8192).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const painRecordSchema = z.strictObject({
  "persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "description": z.string().min(1).max(8192),
  "frequency": z.union([z.strictObject({
  "value": z.string().min(1).max(8192),
  "basis_type": z.enum(["subjective", "observed"]),
  "source_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()])
}), z.null()]),
  "severity": z.union([z.strictObject({
  "value": z.string().min(1).max(8192),
  "basis_type": z.enum(["subjective", "observed"]),
  "source_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()])
}), z.null()]),
  "basis": z.string().min(1).max(8192),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]),
  "evidence": z.array(z.strictObject({
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const desireCreateSchema = z.strictObject({
  "persona_ref": refSchema,
  "desired_outcome": z.string().min(1).max(8192),
  "dimension": z.enum(["functional", "emotional", "social"]),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
});

export const desireChangesSchema = z.strictObject({
  "persona_ref": refSchema.optional(),
  "desired_outcome": z.string().min(1).max(8192).optional(),
  "dimension": z.enum(["functional", "emotional", "social"]).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const desireUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "persona_ref": refSchema,
  "desired_outcome": z.string().min(1).max(8192),
  "dimension": z.enum(["functional", "emotional", "social"]),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "persona_ref": refSchema.optional(),
  "desired_outcome": z.string().min(1).max(8192).optional(),
  "dimension": z.enum(["functional", "emotional", "social"]).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const desireRecordSchema = z.strictObject({
  "persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "desired_outcome": z.string().min(1).max(8192),
  "dimension": z.enum(["functional", "emotional", "social"]),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]),
  "evidence": z.array(z.strictObject({
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const objectionCreateSchema = z.strictObject({
  "persona_ref": refSchema,
  "objection": z.string().min(1).max(8192),
  "proposed_response": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "fact_refs": z.array(refSchema).min(0).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
});

export const objectionChangesSchema = z.strictObject({
  "persona_ref": refSchema.optional(),
  "objection": z.string().min(1).max(8192).optional(),
  "proposed_response": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "fact_refs": z.array(refSchema).min(0).max(100).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const objectionUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "persona_ref": refSchema,
  "objection": z.string().min(1).max(8192),
  "proposed_response": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "fact_refs": z.array(refSchema).min(0).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "persona_ref": refSchema.optional(),
  "objection": z.string().min(1).max(8192).optional(),
  "proposed_response": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "fact_refs": z.array(refSchema).min(0).max(100).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const objectionRecordSchema = z.strictObject({
  "persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "objection": z.string().min(1).max(8192),
  "proposed_response": z.union([z.string().min(1).max(8192), z.null()]),
  "fact_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]),
  "evidence": z.array(z.strictObject({
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const angleCreateSchema = z.strictObject({
  "persona_ref": refSchema,
  "name": z.string().min(1).max(160),
  "promise": z.string().min(1).max(8192),
  "mechanism": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "hook": z.string().min(1).max(8192),
  "jtbd_refs": z.array(refSchema).min(1).max(100),
  "pain_refs": z.array(refSchema).min(1).max(100),
  "desire_refs": z.array(refSchema).min(0).max(100),
  "fact_refs": z.array(refSchema).min(0).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "frame": z.union([z.enum(["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"]), z.null()]).optional(),
  "tone": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "speaks_to": z.enum(["buyer", "user", "both"]),
  "trigger": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "generation_guidance": z.union([generationGuidanceSchema, z.null()]).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
});

export const angleChangesSchema = z.strictObject({
  "persona_ref": refSchema.optional(),
  "name": z.string().min(1).max(160).optional(),
  "promise": z.string().min(1).max(8192).optional(),
  "mechanism": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "hook": z.string().min(1).max(8192).optional(),
  "jtbd_refs": z.array(refSchema).min(1).max(100).optional(),
  "pain_refs": z.array(refSchema).min(1).max(100).optional(),
  "desire_refs": z.array(refSchema).min(0).max(100).optional(),
  "fact_refs": z.array(refSchema).min(0).max(100).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "frame": z.union([z.enum(["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"]), z.null()]).optional(),
  "tone": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "speaks_to": z.enum(["buyer", "user", "both"]).optional(),
  "trigger": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "generation_guidance": z.union([generationGuidanceSchema, z.null()]).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const angleUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "persona_ref": refSchema,
  "name": z.string().min(1).max(160),
  "promise": z.string().min(1).max(8192),
  "mechanism": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "hook": z.string().min(1).max(8192),
  "jtbd_refs": z.array(refSchema).min(1).max(100),
  "pain_refs": z.array(refSchema).min(1).max(100),
  "desire_refs": z.array(refSchema).min(0).max(100),
  "fact_refs": z.array(refSchema).min(0).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "frame": z.union([z.enum(["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"]), z.null()]).optional(),
  "tone": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "speaks_to": z.enum(["buyer", "user", "both"]),
  "trigger": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "generation_guidance": z.union([generationGuidanceSchema, z.null()]).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "persona_ref": refSchema.optional(),
  "name": z.string().min(1).max(160).optional(),
  "promise": z.string().min(1).max(8192).optional(),
  "mechanism": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "hook": z.string().min(1).max(8192).optional(),
  "jtbd_refs": z.array(refSchema).min(1).max(100).optional(),
  "pain_refs": z.array(refSchema).min(1).max(100).optional(),
  "desire_refs": z.array(refSchema).min(0).max(100).optional(),
  "fact_refs": z.array(refSchema).min(0).max(100).optional(),
  "priority": z.number().int().min(1).max(1000000).optional(),
  "frame": z.union([z.enum(["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"]), z.null()]).optional(),
  "tone": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "speaks_to": z.enum(["buyer", "user", "both"]).optional(),
  "trigger": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "generation_guidance": z.union([generationGuidanceSchema, z.null()]).optional(),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]).optional(),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "evidence": z.array(z.strictObject({
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const angleRecordSchema = z.strictObject({
  "persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "name": z.string().min(1).max(160),
  "promise": z.string().min(1).max(8192),
  "mechanism": z.union([z.string().min(1).max(8192), z.null()]),
  "hook": z.string().min(1).max(8192),
  "jtbd_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100),
  "pain_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100),
  "desire_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100),
  "fact_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100),
  "priority": z.number().int().min(1).max(1000000),
  "frame": z.union([z.enum(["authority", "common_enemy", "unique_mechanism", "age_identity", "personal_story", "offer"]), z.null()]),
  "tone": z.union([z.string().min(1).max(8192), z.null()]),
  "speaks_to": z.enum(["buyer", "user", "both"]),
  "trigger": z.union([z.string().min(1).max(8192), z.null()]),
  "generation_guidance": z.union([z.strictObject({
  "central_message": z.string().min(1).max(8192).optional(),
  "hook_delivery": z.enum(["confiding", "intrigued", "surprised", "indignant", "deadpan", "playful"]).optional(),
  "opening_shot": z.enum(["selfie_talk", "pov_hands", "problem_scene", "product_in_place", "mirror", "real_footage"]).optional(),
  "first_motion": z.string().min(1).max(8192).optional(),
  "spoken_hook": z.string().min(1).max(8192).optional(),
  "screen_hook": z.string().min(1).max(8192).optional(),
  "follow_up": z.string().min(1).max(8192).optional(),
  "ugc_notes": z.string().min(1).max(8192).optional(),
  "landing_notes": z.string().min(1).max(8192).optional(),
  "objection_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100).optional(),
  "proof_fact_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 }), z.null()]),
  "epistemic_status": z.enum(["hypothesis", "observed", "validated"]),
  "validation_note": z.union([z.string().min(1).max(8192), z.null()]),
  "evidence": z.array(z.strictObject({
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
})).min(0).max(100),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const customer_languageCreateSchema = z.strictObject({
  "text": z.string().min(1).max(8192),
  "type": z.enum(["hook", "ugc_script", "question", "reply", "customer_quote"]),
  "origin": z.enum(["synthetic", "observed"]),
  "persona_ref": refSchema,
  "angle_ref": z.union([refSchema, z.null()]),
  "source_ref": z.union([refSchema, z.null()])
});

export const customer_languageChangesSchema = z.strictObject({
  "text": z.string().min(1).max(8192).optional(),
  "type": z.enum(["hook", "ugc_script", "question", "reply", "customer_quote"]).optional(),
  "origin": z.enum(["synthetic", "observed"]).optional(),
  "persona_ref": refSchema.optional(),
  "angle_ref": z.union([refSchema, z.null()]).optional(),
  "source_ref": z.union([refSchema, z.null()]).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const customer_languageUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "text": z.string().min(1).max(8192),
  "type": z.enum(["hook", "ugc_script", "question", "reply", "customer_quote"]),
  "origin": z.enum(["synthetic", "observed"]),
  "persona_ref": refSchema,
  "angle_ref": z.union([refSchema, z.null()]),
  "source_ref": z.union([refSchema, z.null()])
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "text": z.string().min(1).max(8192).optional(),
  "type": z.enum(["hook", "ugc_script", "question", "reply", "customer_quote"]).optional(),
  "origin": z.enum(["synthetic", "observed"]).optional(),
  "persona_ref": refSchema.optional(),
  "angle_ref": z.union([refSchema, z.null()]).optional(),
  "source_ref": z.union([refSchema, z.null()]).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const customer_languageRecordSchema = z.strictObject({
  "text": z.string().min(1).max(8192),
  "type": z.enum(["hook", "ugc_script", "question", "reply", "customer_quote"]),
  "origin": z.enum(["synthetic", "observed"]),
  "persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "angle_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "source_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const offerCreateSchema = z.strictObject({
  "name": z.string().min(1).max(160),
  "headline": z.string().min(1).max(8192),
  "items": z.array(z.strictObject({
  "units": z.number().int().min(1).max(3),
  "label_proposal": z.union([z.string().min(1).max(160), z.null()])
})).min(1).max(3),
  "priority": z.number().int().min(1).max(1000000)
});

export const offerChangesSchema = z.strictObject({
  "name": z.string().min(1).max(160).optional(),
  "headline": z.string().min(1).max(8192).optional(),
  "items": z.array(z.strictObject({
  "units": z.number().int().min(1).max(3),
  "label_proposal": z.union([z.string().min(1).max(160), z.null()])
})).min(1).max(3).optional(),
  "priority": z.number().int().min(1).max(1000000).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const offerUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "name": z.string().min(1).max(160),
  "headline": z.string().min(1).max(8192),
  "items": z.array(z.strictObject({
  "units": z.number().int().min(1).max(3),
  "label_proposal": z.union([z.string().min(1).max(160), z.null()])
})).min(1).max(3),
  "priority": z.number().int().min(1).max(1000000)
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "name": z.string().min(1).max(160).optional(),
  "headline": z.string().min(1).max(8192).optional(),
  "items": z.array(z.strictObject({
  "units": z.number().int().min(1).max(3),
  "label_proposal": z.union([z.string().min(1).max(160), z.null()])
})).min(1).max(3).optional(),
  "priority": z.number().int().min(1).max(1000000).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const financialSnapshotSchema = z.strictObject({
  "currency": z.string().regex(new RegExp("^[A-Z]{3}$")),
  "currency_scale": z.number().int().min(0).max(4),
  "pricing_stamp": z.string().regex(new RegExp("^[0-9a-f]{64}$")),
  "unit_cost_minor": z.number().int().min(1).max(9007199254740991),
  "avg_shipping_cost_minor": z.number().int().min(0).max(9007199254740991),
  "purchase_cost_limit_minor": z.number().int().min(0).max(9007199254740991),
  "confirmation_rate": z.number().min(0).max(100),
  "delivery_rate": z.number().min(0).max(100),
  "extra_unit_discount": z.number().min(0).max(95),
  "sale_price_minor": z.number().int().min(1).max(9007199254740991),
  "compare_at_price_minor": z.union([z.number().int().min(1).max(9007199254740991), z.null()]),
  "minimum_price_minor": z.number().int().min(1).max(9007199254740991),
  "recommended_price_minor": z.number().int().min(1).max(9007199254740991),
  "margin": z.number(),
  "beroas": z.union([z.number(), z.null()]),
  "packs": z.array(z.strictObject({
  "units": z.number().int().min(1).max(3),
  "price_minor": z.number().int().min(1).max(9007199254740991),
  "savings_minor": z.number().int().min(0).max(9007199254740991),
  "recommended": z.boolean(),
  "approved_label": z.union([z.string().min(1).max(160), z.null()]),
  "profit_decimal": z.string().max(80).regex(new RegExp("^-?[0-9]+(?:\\.[0-9]+)?$")),
  "per_unit_price_decimal": z.string().max(80).regex(new RegExp("^-?[0-9]+(?:\\.[0-9]+)?$"))
})).min(3).max(3),
  "profit_decimal": z.string().max(80).regex(new RegExp("^-?[0-9]+(?:\\.[0-9]+)?$")),
  "max_cpa_decimal": z.union([z.string().max(80).regex(new RegExp("^-?[0-9]+(?:\\.[0-9]+)?$")), z.null()])
});

export const offerRecordSchema = z.strictObject({
  "name": z.string().min(1).max(160),
  "headline": z.string().min(1).max(8192),
  "items": z.array(z.strictObject({
  "units": z.number().int().min(1).max(3),
  "price_minor": z.union([z.number().int().min(1).max(9007199254740991), z.null()]),
  "label_proposal": z.union([z.string().min(1).max(160), z.null()]),
  "approved_label": z.union([z.string().min(1).max(160), z.null()])
})).min(1).max(3),
  "priority": z.number().int().min(1).max(1000000),
  "financial_snapshot": z.union([financialSnapshotSchema, z.null()]),
  "pricing_stamp": z.union([z.string().regex(new RegExp("^[0-9a-f]{64}$")), z.null()]),
  "policies_stamp": z.union([z.string().regex(new RegExp("^[0-9a-f]{64}$")), z.null()]),
  "stale": z.boolean(),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "lifecycle": z.enum(["active", "archived"]),
  "archived_reason": z.union([z.string().min(1).max(8192), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const sourceUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "title": z.string().min(1).max(256),
  "source_type": z.enum(["manufacturer", "supplier", "retailer", "study", "customer", "internal", "other"]),
  "retrieved_at": z.iso.datetime().regex(new RegExp("Z$")),
  "excerpt": z.string().min(1).max(8192),
  "author": z.union([z.string().min(1).max(256), z.null()]),
  "editor": z.union([z.string().min(1).max(256), z.null()]),
  "url": z.union([z.string().max(2048).regex(new RegExp("^https://")).refine(isHttpsUrl, "Usa una URL HTTPS válida.").meta({ format: "uri" }), z.null()]),
  "internal_ref": z.union([z.strictObject({
  "kind": z.enum(["product_review", "product_reference_image", "merchant_note", "asset", "product_learning"]),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })
}), z.null()])
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "title": z.string().min(1).max(256).optional(),
  "source_type": z.enum(["manufacturer", "supplier", "retailer", "study", "customer", "internal", "other"]).optional(),
  "retrieved_at": z.iso.datetime().regex(new RegExp("Z$")).optional(),
  "excerpt": z.string().min(1).max(8192).optional(),
  "author": z.union([z.string().min(1).max(256), z.null()]).optional(),
  "editor": z.union([z.string().min(1).max(256), z.null()]).optional(),
  "url": z.union([z.string().max(2048).regex(new RegExp("^https://")).refine(isHttpsUrl, "Usa una URL HTTPS válida.").meta({ format: "uri" }), z.null()]).optional(),
  "internal_ref": z.union([z.strictObject({
  "kind": z.enum(["product_review", "product_reference_image", "merchant_note", "asset", "product_learning"]),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })
}), z.null()]).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const sourceRecordSchema = z.strictObject({
  "title": z.string().min(1).max(256),
  "source_type": z.enum(["manufacturer", "supplier", "retailer", "study", "customer", "internal", "other"]),
  "retrieved_at": z.iso.datetime().regex(new RegExp("Z$")),
  "excerpt": z.string().min(1).max(8192),
  "author": z.union([z.string().min(1).max(256), z.null()]),
  "editor": z.union([z.string().min(1).max(256), z.null()]),
  "url": z.union([z.string().max(2048).regex(new RegExp("^https://")).refine(isHttpsUrl, "Usa una URL HTTPS válida.").meta({ format: "uri" }), z.null()]),
  "internal_ref": z.union([z.strictObject({
  "kind": z.enum(["product_review", "product_reference_image", "merchant_note", "asset", "product_learning"]),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })
}), z.null()]),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const factUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "key": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "statement": z.string().min(1).max(8192),
  "value": jsonValueSchema,
  "unit": z.union([z.string().min(1).max(64), z.null()]),
  "verification_status": z.enum(["unverified", "verified", "disputed", "rejected"]),
  "usage_status": z.enum(["pending", "approved", "prohibited"]),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "key": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")).optional(),
  "statement": z.string().min(1).max(8192).optional(),
  "value": jsonValueSchema.optional(),
  "unit": z.union([z.string().min(1).max(64), z.null()]).optional(),
  "verification_status": z.enum(["unverified", "verified", "disputed", "rejected"]).optional(),
  "usage_status": z.enum(["pending", "approved", "prohibited"]).optional(),
  "reason": z.string().min(1).max(8192).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const factRecordSchema = z.strictObject({
  "key": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "statement": z.string().min(1).max(8192),
  "value": jsonValueSchema,
  "unit": z.union([z.string().min(1).max(64), z.null()]),
  "verification_status": z.enum(["unverified", "verified", "disputed", "rejected"]),
  "usage_status": z.enum(["pending", "approved", "prohibited"]),
  "reason": z.string().min(1).max(8192),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const evidenceLinkUpsertSchema = z.union([z.strictObject({
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "fact_ref": refSchema,
  "source_ref": refSchema,
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192)
}), z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "fact_ref": refSchema.optional(),
  "source_ref": refSchema.optional(),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]).optional(),
  "fragment": z.string().min(1).max(8192).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 })]);

export const evidenceLinkRecordSchema = z.strictObject({
  "fact_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "source_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "relation": z.enum(["supports", "contradicts", "contextualizes"]),
  "fragment": z.string().min(1).max(8192),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const pricingInputSchema = z.union([z.strictObject({
  "mode": z.literal("recommended"),
  "unit_cost_minor": z.number().int().min(1).max(9007199254740991).optional(),
  "avg_shipping_cost_minor": z.number().int().min(0).max(9007199254740991).optional(),
  "purchase_cost_limit_minor": z.number().int().min(0).max(9007199254740991).optional(),
  "confirmation_rate": z.number().min(0).max(100).optional(),
  "delivery_rate": z.number().min(0).max(100).optional(),
  "extra_unit_discount": z.number().min(0).max(95).optional()
}).refine((value) => Object.keys(value).length >= 2, "Envía al menos un cambio.").meta({ minProperties: 2 }), z.strictObject({
  "mode": z.literal("manual"),
  "unit_cost_minor": z.number().int().min(1).max(9007199254740991).optional(),
  "avg_shipping_cost_minor": z.number().int().min(0).max(9007199254740991).optional(),
  "purchase_cost_limit_minor": z.number().int().min(0).max(9007199254740991).optional(),
  "confirmation_rate": z.number().min(0).max(100).optional(),
  "delivery_rate": z.number().min(0).max(100).optional(),
  "extra_unit_discount": z.number().min(0).max(95).optional(),
  "sale_price_minor": z.number().int().min(1).max(9007199254740991),
  "compare_at_price_minor": z.union([z.number().int().min(1).max(9007199254740991), z.null()])
})]);

export const basicInputSchema = z.strictObject({
  "display_name": z.string().min(1).max(256).optional(),
  "category": z.union([z.string().min(1).max(160), z.null()]).optional(),
  "description": z.string().min(1).max(8192).optional(),
  "supplier_text": z.union([z.string().min(1).max(8192), z.null()]).optional(),
  "base_reference_image_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 });

export const marketSchema = z.strictObject({
  "country_code": z.string().regex(new RegExp("^[A-Z]{2}$")),
  "currency": z.string().regex(new RegExp("^[A-Z]{3}$")),
  "language": z.enum(["es", "pt-BR"]),
  "timezone": z.union([z.string().min(1).max(80), z.null()]),
  "confirmed": z.boolean()
});

export const policiesSchema = z.strictObject({
  "cod": z.union([z.boolean(), z.null()]),
  "free_shipping": z.union([z.boolean(), z.null()]),
  "delivery": z.union([z.string().min(1).max(8192), z.null()]),
  "returns": z.union([z.string().min(1).max(8192), z.null()]),
  "warranty": z.union([z.string().min(1).max(8192), z.null()]),
  "restrictions": z.array(z.string().min(1).max(8192)).min(0).max(100),
  "policies_stamp": z.string().regex(new RegExp("^[0-9a-f]{64}$"))
});

export const readinessSchema = z.strictObject({
  "ready_for_execution": z.boolean(),
  "stale": z.boolean(),
  "needs_review": z.boolean(),
  "missing_fields": z.array(z.string().min(1).max(256)).min(0).max(100)
});

export const referenceImageSchema = z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "is_base": z.boolean(),
  "content_hash": z.string().regex(new RegExp("^[0-9a-f]{64}$"))
});

export const basicRecordSchema = z.strictObject({
  "display_name": z.string().min(1).max(256),
  "category": z.union([z.string().min(1).max(160), z.null()]),
  "description": z.string().min(1).max(8192),
  "supplier_text": z.union([z.string().min(1).max(8192), z.null()]),
  "base_reference_image_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "last_revision": z.number().int().min(1).max(9007199254740991)
});

export const productSchema = z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "catalog_title": z.string().min(1).max(256),
  "shopify_product_id": z.string().min(1).max(80),
  "currency": z.string().regex(new RegExp("^[A-Z]{3}$")),
  "is_upsell": z.boolean(),
  "context": z.union([basicRecordSchema, z.null()]),
  "market": marketSchema,
  "pricing": z.union([financialSnapshotSchema, z.null()]),
  "policies": policiesSchema
});

export const strategySnapshotSchema = z.strictObject({
  "persona": personaRecordSchema,
  "jtbd": jtbdRecordSchema,
  "pain": painRecordSchema,
  "related_jtbd": z.array(jtbdRecordSchema).min(0).max(100),
  "related_pains": z.array(painRecordSchema).min(0).max(100),
  "desires": z.array(desireRecordSchema).min(0).max(100),
  "angles": z.array(angleRecordSchema).min(1).max(100),
  "offer": z.union([offerRecordSchema, z.null()]),
  "facts": z.array(factRecordSchema).min(0).max(100),
  "sources": z.array(sourceRecordSchema).min(0).max(100),
  "evidence_links": z.array(evidenceLinkRecordSchema).min(0).max(100),
  "objections": z.array(objectionRecordSchema).min(0).max(100),
  "customer_language": z.array(customer_languageRecordSchema).min(0).max(100),
  "positioning": z.string().min(1).max(8192),
  "rationale": z.string().min(1).max(8192)
});

export const strategySchema = z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "state": z.enum(["draft", "selected", "superseded", "archived"]),
  "include": z.enum(["core", "execution"]),
  "analysis_revision": z.number().int().min(0).max(9007199254740991),
  "selection_revision": z.union([z.number().int().min(1).max(9007199254740991), z.null()]),
  "snapshot": strategySnapshotSchema,
  "readiness": readinessSchema,
  "current_revision": z.number().int().min(0).max(9007199254740991)
});

export const patchOperationSchema = z.union([z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("persona"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": personaCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("persona"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": personaChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("persona"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("persona"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("persona"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("jtbd"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": jtbdCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("jtbd"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": jtbdChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("jtbd"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("jtbd"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("jtbd"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("pain"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": painCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("pain"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": painChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("pain"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("pain"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("pain"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("desire"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": desireCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("desire"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": desireChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("desire"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("desire"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("desire"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("objection"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": objectionCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("objection"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": objectionChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("objection"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("objection"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("objection"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("angle"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": angleCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("angle"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": angleChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("angle"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("angle"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("angle"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("customer_language"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": customer_languageCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("customer_language"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": customer_languageChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("customer_language"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("customer_language"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("create"),
  "entity": z.literal("offer"),
  "client_ref": z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")),
  "payload": offerCreateSchema
}), z.strictObject({
  "op": z.literal("update"),
  "entity": z.literal("offer"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "changes": offerChangesSchema
}), z.strictObject({
  "op": z.literal("archive"),
  "entity": z.literal("offer"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("restore"),
  "entity": z.literal("offer"),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
}), z.strictObject({
  "op": z.literal("reprioritize"),
  "entity": z.literal("offer"),
  "persona_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "ordered_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true })
})]);

export const diffItemSchema = z.strictObject({
  "entity": z.enum(["context", "pricing", "source", "fact", "evidence_link", "persona", "jtbd", "pain", "desire", "objection", "angle", "customer_language", "offer", "strategy"]),
  "action": z.enum(["create", "update", "archive", "restore", "reprioritize", "select"]),
  "id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "client_ref": z.union([z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")), z.null()]),
  "changed_fields": z.array(z.string().min(1).max(80)).min(0).max(100)
});

export const mutationResultSchema = z.strictObject({
  "applied": z.boolean(),
  "dry_run": z.boolean(),
  "no_op": z.boolean(),
  "base_revision": z.number().int().min(0).max(9007199254740991),
  "id_map": z.record(z.string().regex(new RegExp("^[a-z][a-z0-9_]{0,63}$")), z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })),
  "diff": z.array(diffItemSchema).min(0).max(100),
  "diff_truncated": z.boolean(),
  "pricing": z.union([financialSnapshotSchema, z.null()])
});

export const selectionResultSchema = z.strictObject({
  "applied": z.boolean(),
  "dry_run": z.boolean(),
  "no_op": z.boolean(),
  "strategy": z.union([strategySchema, z.null()]),
  "preview": z.union([strategySnapshotSchema, z.null()]),
  "active_strategy_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()])
});

export const blockItemSchema = z.union([personaRecordSchema, jtbdRecordSchema, painRecordSchema, desireRecordSchema, objectionRecordSchema, angleRecordSchema, customer_languageRecordSchema, offerRecordSchema, sourceRecordSchema, factRecordSchema, evidenceLinkRecordSchema, z.strictObject({
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "summary": z.string().min(1).max(8192),
  "provenance": z.enum(["canonical", "unknown"]),
  "strategy_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "analysis_revision": z.union([z.number().int().min(0).max(9007199254740991), z.null()])
})]);

export const blockSchema = z.strictObject({
  "name": z.enum(["facts", "research", "personas", "jtbd", "pains", "desires", "objections", "angles", "customer_language", "offer", "strategy", "pdp", "assets", "performance"]),
  "items": z.array(blockItemSchema).min(0).max(100),
  "summary": z.union([z.string().min(1).max(8192), z.null()]),
  "count": z.number().int().min(0).max(9007199254740991),
  "as_of": z.union([z.iso.datetime().regex(new RegExp("Z$")), z.null()]),
  "availability": z.enum(["snapshot", "unknown"]),
  "strategy": z.union([strategySchema, z.null()])
});

export const contextResultSchema = z.strictObject({
  "schema_version": z.literal("1.0"),
  "current_revision": z.number().int().min(0).max(9007199254740991),
  "product": productSchema,
  "blocks": z.array(blockSchema).min(0).max(14),
  "active_strategy_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "readiness": readinessSchema,
  "next_cursor": z.union([z.string().min(1).max(2048), z.null()]),
  "truncated": z.boolean(),
  "current_usage_restrictions": z.array(z.strictObject({
  "fact_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
})).min(0).max(100)
});

export const costSchema = z.strictObject({
  "recorded_usd": z.union([z.number().min(0), z.null()]),
  "estimated_usd": z.union([z.number().min(0), z.null()]),
  "is_estimate": z.boolean(),
  "as_of": z.iso.datetime().regex(new RegExp("Z$"))
});

export const generationOutputSchema = z.strictObject({
  "kind": z.enum(["page_component", "page_image", "video_script", "video_shot", "video_final"]),
  "id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "status": z.enum(["generated", "in_review", "approved", "rejected", "error"]),
  "artifact_etag": z.string().regex(new RegExp("^[0-9a-f]{64}$")),
  "review_path": z.string().min(1).max(1024),
  "strategy_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "analysis_revision": z.number().int().min(0).max(9007199254740991),
  "angle_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()])
});

export const generationStatusSchema = z.strictObject({
  "operation_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "kind": z.enum(["landing", "ugc"]),
  "stage": z.enum(["content", "images", "script", "keyframes", "clips"]),
  "status": z.enum(["queued", "running", "succeeded", "failed", "reconciling", "cancelled"]),
  "status_revision": z.number().int().min(1).max(9007199254740991),
  "strategy_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "analysis_revision": z.number().int().min(0).max(9007199254740991),
  "request_revision": z.number().int().min(0).max(9007199254740991),
  "input_hash": z.string().regex(new RegExp("^[0-9a-f]{64}$")),
  "created_at": z.iso.datetime().regex(new RegExp("Z$")),
  "updated_at": z.iso.datetime().regex(new RegExp("Z$")),
  "outputs": z.array(generationOutputSchema).min(0).max(100),
  "cost": costSchema,
  "requires_review": z.boolean(),
  "context_stale": z.boolean(),
  "needs_review": z.boolean(),
  "next_actions": z.array(z.enum(["review_content", "review_script", "review_keyframes", "generate_keyframes", "generate_clips", "download_montage_package", "upload_final_video", "review_final_video", "publish_in_ui", "reconcile_provider", "retry_explicitly"])).min(0).max(100),
  "failure": z.union([errorSchema, z.null()]),
  "next_cursor": z.union([z.string().min(1).max(2048), z.null()]),
  "truncated": z.boolean()
});

export const generationPreviewSchema = z.strictObject({
  "dry_run": z.literal(true),
  "stage": z.enum(["content", "images", "script", "keyframes", "clips"]),
  "strategy_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "analysis_revision": z.number().int().min(0).max(9007199254740991),
  "will_call_providers": z.array(z.enum(["anthropic", "higgsfield", "gemini"])).min(0).max(100),
  "max_output_items": z.number().int().min(1).max(100),
  "estimated_usd": z.union([z.number().min(0), z.null()]),
  "missing_fields": z.array(z.string().min(1).max(256)).min(0).max(100)
});

export const generationResultSchema = z.union([generationStatusSchema, generationPreviewSchema]);

export const get_product_contextInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "include": z.array(z.enum(["facts", "research", "personas", "jtbd", "pains", "desires", "objections", "angles", "customer_language", "offer", "strategy", "pdp", "assets", "performance"])).min(1).max(14).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true }).optional(),
  "view": z.enum(["summary", "full"]).default("summary"),
  "at_revision": z.number().int().min(0).max(9007199254740991).optional(),
  "page_size": z.number().int().min(1).max(100).default(50),
  "cursor": z.string().min(1).max(2048).optional(),
  "include_archived": z.boolean().default(false)
});

export const get_product_contextOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": contextResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const save_product_contextInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "context": basicInputSchema.optional(),
  "pricing": pricingInputSchema.optional()
}).refine((value) => value.context !== undefined || value.pricing !== undefined, "Envía context, pricing o una combinación.").meta({ anyOf: [{"required": ["context"]}, {"required": ["pricing"]}] });

export const save_product_contextOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": mutationResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const save_product_analysisInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "analysis": z.strictObject({
  "personas": z.array(personaUpsertSchema).min(0).max(100).optional(),
  "jtbd": z.array(jtbdUpsertSchema).min(0).max(100).optional(),
  "pains": z.array(painUpsertSchema).min(0).max(100).optional(),
  "desires": z.array(desireUpsertSchema).min(0).max(100).optional(),
  "objections": z.array(objectionUpsertSchema).min(0).max(100).optional(),
  "angles": z.array(angleUpsertSchema).min(0).max(100).optional(),
  "customer_language": z.array(customer_languageUpsertSchema).min(0).max(100).optional()
}).refine((value) => Object.keys(value).length >= 1, "Envía al menos un cambio.").meta({ minProperties: 1 }),
  "offer": offerUpsertSchema.optional(),
  "methodological_notes": z.union([z.string().min(1).max(8192), z.null()]).optional()
});

export const save_product_analysisOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": mutationResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const patch_product_analysisInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "operations": z.array(patchOperationSchema).min(1).max(50)
});

export const patch_product_analysisOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": mutationResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const save_researchInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "sources": z.array(sourceUpsertSchema).min(0).max(100).optional(),
  "facts": z.array(factUpsertSchema).min(0).max(100).optional(),
  "evidence_links": z.array(evidenceLinkUpsertSchema).min(0).max(100).optional()
}).refine((value) => value.sources !== undefined || value.facts !== undefined || value.evidence_links !== undefined, "Envía sources, facts, evidence_links o una combinación.").meta({ anyOf: [{"required": ["sources"]}, {"required": ["facts"]}, {"required": ["evidence_links"]}] });

export const save_researchOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": mutationResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const get_product_strategyInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "strategy_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }).optional(),
  "include": z.enum(["core", "execution"]).default("core")
});

export const get_product_strategyOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": z.union([strategySchema, z.null()]),
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const get_generation_statusInputSchema = z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "operation_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "page_size": z.number().int().min(1).max(100).default(50),
  "cursor": z.string().min(1).max(2048).optional()
});

export const get_generation_statusOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": generationStatusSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const set_product_strategyInputSchema = z.union([z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "action": z.literal("create_draft"),
  "primary_persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "primary_jtbd_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "primary_pain_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "primary_angle_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "secondary_angle_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true }),
  "positioning": z.string().min(1).max(8192),
  "offer_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "rationale": z.string().min(1).max(8192),
  "based_on_revision": z.number().int().min(0).max(9007199254740991)
}), z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "action": z.literal("select"),
  "primary_persona_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "primary_jtbd_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "primary_pain_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "primary_angle_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "secondary_angle_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100).refine(uniqueItems, "No repitas elementos.").meta({ uniqueItems: true }),
  "positioning": z.string().min(1).max(8192),
  "offer_id": z.union([z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }), z.null()]),
  "rationale": z.string().min(1).max(8192),
  "based_on_revision": z.number().int().min(0).max(9007199254740991)
}), z.strictObject({
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "schema_version": z.literal("1.0"),
  "expected_revision": z.number().int().min(0).max(9007199254740991),
  "idempotency_key": z.string().min(8).max(128).regex(new RegExp("^[A-Za-z0-9._:-]+$")),
  "dry_run": z.boolean().default(false),
  "action": z.literal("archive"),
  "strategy_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
})]);

export const set_product_strategyOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": selectionResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const generate_ugcInputSchema = z.strictObject({
  product_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).meta({ format: "uuid" }), schema_version: z.literal("1.0"),
  expected_revision: z.number().int().nonnegative().safe(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/), dry_run: z.boolean().default(false),
  replace_existing: z.boolean().default(false),
  stage: z.enum(["keyframes", "clips"]), script_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).meta({ format: "uuid" }),
  expected_artifact_etag: z.string().regex(/^[0-9a-f]{64}$/),
  shot_keys: z.array(z.string().regex(/^[KAB][1-9][0-9]?$/)).min(1).max(20).refine(uniqueItems, "No repitas tomas."),
});

export const generate_ugcOutputSchema = z.union([z.strictObject({
  "ok": z.literal(true),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "revision": z.number().int().min(0).max(9007199254740991),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "data": generationResultSchema,
  "warnings": z.array(warningSchema).min(0).max(100)
}), z.strictObject({
  "ok": z.literal(false),
  "request_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "error": errorSchema
})]);

export const generationContextSchema = z.strictObject({
  "schema_version": z.literal("1.0"),
  "product_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "strategy_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "analysis_revision": z.number().int().min(0).max(9007199254740991),
  "request_revision": z.number().int().min(0).max(9007199254740991),
  "captured_at": z.iso.datetime().regex(new RegExp("Z$")),
  "product": basicRecordSchema,
  "market": marketSchema,
  "policies": policiesSchema,
  "pricing": financialSnapshotSchema,
  "strategy": strategySnapshotSchema,
  "reference_images": z.array(referenceImageSchema).min(1).max(100),
  "selected_page_image_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100),
  "selected_angle_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(1).max(100),
  "approved_fact_ids": z.array(z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" })).min(0).max(100),
  "blocked_claims": z.array(z.strictObject({
  "entity_id": z.string().regex(new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")).meta({ format: "uuid" }),
  "reason": z.string().min(1).max(8192)
})).min(0).max(100),
  "image_qa_enabled": z.boolean(),
  "prompt_versions": z.strictObject({
  "writer": z.number().int().min(1).max(9007199254740991),
  "planner": z.union([z.number().int().min(1).max(9007199254740991), z.null()])
}),
  "cost_policy": z.strictObject({
  "merchant_cap_usd": z.union([z.number().min(0), z.null()]),
  "automatic_retry_limit": z.number().int().min(0).max(3)
})
});

export const inputSchemas = {
  ...shopifyAutomationInputs,
  list_products: listProductsInput,
  ...visualInputSchemas, ...persuasionInputSchemas, ...contentInputSchemas, ...learningInputSchemas, ...galleryGenerationInputs,
  get_ugc_content: getUgcInput, save_ugc_content: saveUgcInput, get_ugc_montage: getUgcMontageInput,
  get_pack_labels: getPackLabelsInput, save_pack_labels: savePackLabelsInput,
  "get_landing_content": getLandingInput,
  "save_landing_content": saveLandingInput,
  "get_product_context": get_product_contextInputSchema,
  "save_product_context": save_product_contextInputSchema,
  "save_product_analysis": save_product_analysisInputSchema,
  "patch_product_analysis": patch_product_analysisInputSchema,
  "save_research": save_researchInputSchema,
  "get_product_strategy": get_product_strategyInputSchema,
  "get_generation_status": get_generation_statusInputSchema,
  "set_product_strategy": set_product_strategyInputSchema,
  "generate_ugc": generate_ugcInputSchema
} as const;

const landingOutputSchemas = landingOutputs(errorSchema);
const packOutputs = packLabelsOutputs(errorSchema);
const ugcOutputSchemas = ugcOutputs(errorSchema);
export const outputSchemas = {
  ...shopifyAutomationOutputs(errorSchema),
  list_products: listProductsOutput(errorSchema),
  ...visualOutputs(errorSchema), ...persuasionOutputs(errorSchema), ...contentOutputs(errorSchema), ...learningOutputs(errorSchema), ...galleryGenerationOutputs(errorSchema),
  get_ugc_content: ugcOutputSchemas.get, save_ugc_content: ugcOutputSchemas.save, get_ugc_montage: ugcOutputSchemas.montage,
  get_pack_labels: packOutputs.get, save_pack_labels: packOutputs.save,
  "get_landing_content": landingOutputSchemas.get,
  "save_landing_content": landingOutputSchemas.save,
  "get_product_context": get_product_contextOutputSchema,
  "save_product_context": save_product_contextOutputSchema,
  "save_product_analysis": save_product_analysisOutputSchema,
  "patch_product_analysis": patch_product_analysisOutputSchema,
  "save_research": save_researchOutputSchema,
  "get_product_strategy": get_product_strategyOutputSchema,
  "get_generation_status": get_generation_statusOutputSchema,
  "set_product_strategy": set_product_strategyOutputSchema,
  "generate_ugc": generate_ugcOutputSchema
} as const;

export type ToolName = keyof typeof inputSchemas;
export type ToolInputs = { [K in ToolName]: z.output<(typeof inputSchemas)[K]> };
export type ToolOutputs = { [K in ToolName]: z.output<(typeof outputSchemas)[K]> };

export type Ref = z.infer<typeof refSchema>;
export type GenerationContext = z.infer<typeof generationContextSchema>;
export type FinancialSnapshot = z.infer<typeof financialSnapshotSchema>;
export type Strategy = z.infer<typeof strategySchema>;
export type DomainError = z.infer<typeof errorSchema>;

export const entityCreateSchemas = {
  "persona": personaCreateSchema,
  "jtbd": jtbdCreateSchema,
  "pain": painCreateSchema,
  "desire": desireCreateSchema,
  "objection": objectionCreateSchema,
  "angle": angleCreateSchema,
  "customer_language": customer_languageCreateSchema,
  "offer": offerCreateSchema
} as const;

export const entityRecordSchemas = {
  "persona": personaRecordSchema,
  "jtbd": jtbdRecordSchema,
  "pain": painRecordSchema,
  "desire": desireRecordSchema,
  "objection": objectionRecordSchema,
  "angle": angleRecordSchema,
  "customer_language": customer_languageRecordSchema,
  "offer": offerRecordSchema,
  "Source": sourceRecordSchema,
  "Fact": factRecordSchema,
  "EvidenceLink": evidenceLinkRecordSchema
} as const;

export type EntityName = keyof typeof entityCreateSchemas;
export type EntityRecords = { [K in keyof typeof entityRecordSchemas]: z.output<(typeof entityRecordSchemas)[K]> };
