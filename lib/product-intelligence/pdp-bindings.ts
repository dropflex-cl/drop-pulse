import { z } from "zod";
// Metadata de procedencia; el contenido conserva el contrato del componente.
export const pdpBindingSchema = z.strictObject({ persuasion_plan_id: z.string().uuid(), experience_id: z.string().uuid().optional(),
  angle_id: z.string().uuid(), landing_angle_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
  landing_hook_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).nullable().optional(), section_key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  belief_keys: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).min(1).max(7), persuasion_job: z.string().min(1).max(64),
  fact_ids: z.array(z.string().uuid()).max(50), claim_keys: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(40) });
