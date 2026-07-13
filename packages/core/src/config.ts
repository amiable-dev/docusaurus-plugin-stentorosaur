/**
 * stentorosaur.config schema (ADR-005 §8; epic #63 ticket #74).
 *
 * ONE config consumed by the probe, the CLI, and (at the #77 cutover)
 * the plugin — replaces the entitiesSource config/monitorrc/hybrid
 * tri-state. Pure schema + defineConfig identity helper; the file
 * LOADER is I/O and lives in @stentorosaur/probe.
 */

import {z} from 'zod';

export const probeTargetSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  timeout: z.number().int().positive().optional(),
  expectedCodes: z.array(z.number().int()).nonempty().optional(),
  maxResponseTime: z.number().int().positive().optional(),
});

export const configEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['system', 'process']),
  displayName: z.string().optional(),
  description: z.string().optional(),
  /** Present → the probe checks it; absent → issue-tracked only */
  probe: probeTargetSchema.optional(),
});

export const stentorosaurConfigSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  /** Data branch name (default status-data) */
  dataBranch: z.string().min(1).default('status-data'),
  entities: z.array(configEntitySchema).min(1),
  incidents: z
    .object({
      statusLabel: z.string().min(1).default('status'),
      maintenanceLabels: z.array(z.string().min(1)).default(['maintenance']),
    })
    .default({statusLabel: 'status', maintenanceLabels: ['maintenance']}),
  site: z
    .object({
      title: z.string().default('System Status'),
      /** Absolute site URL for the atom feed */
      url: z.string().url().optional(),
    })
    .default({title: 'System Status'}),
  labelScheme: z
    .object({
      separator: z.string().min(1).optional(),
      defaultType: z.enum(['system', 'process']).optional(),
      allowUntyped: z.boolean().optional(),
    })
    .optional(),
});

export type StentorosaurConfig = z.infer<typeof stentorosaurConfigSchema>;
export type StentorosaurConfigInput = z.input<typeof stentorosaurConfigSchema>;

/** Identity helper for typed config files. */
export function defineConfig(config: StentorosaurConfigInput): StentorosaurConfigInput {
  return config;
}

/** Parse + validate with actionable errors. */
export function parseConfig(input: unknown): StentorosaurConfig {
  const result = stentorosaurConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`invalid stentorosaur config:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
