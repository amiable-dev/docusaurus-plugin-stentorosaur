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

/**
 * Data-plane profile selection (ADR-006 §6). Absent → Profile A/B (git
 * data branch) exactly as before. A discriminated union so the r2
 * fields are REQUIRED when selected and REJECTED on the git profile —
 * a typo'd or half-configured profile must fail loudly, never fall
 * back silently.
 */
export const dataPlaneSchema = z
  .discriminatedUnion('kind', [
    z.object({kind: z.literal('git')}).strict(),
    z
      .object({
        kind: z.literal('r2'),
        /** R2 bucket name */
        bucket: z.string().min(1),
        /** S3-compatible API endpoint (CLI writes) — https only (ADR-006 §2):
         * R2 credentials travel over it */
        endpoint: z
          .string()
          .url()
          .refine(u => u.startsWith('https://'), {
            message: 'endpoint must be https (credentials travel over it)',
          }),
        /** Public base the plugin's dataUrl points at — the client
         * polls it, so https only (ADR-006 §2) */
        publicBaseUrl: z
          .string()
          .url()
          .refine(u => u.startsWith('https://'), {
            message: 'publicBaseUrl must be https (clients poll it)',
          }),
      })
      .strict(),
  ])
  .default({kind: 'git'});

export const stentorosaurConfigSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  /** Data branch name (default status-data) — Profile A/B */
  dataBranch: z.string().min(1).default('status-data'),
  /** Data-plane profile (ADR-006); default git */
  dataPlane: dataPlaneSchema,
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

export type DataPlane = z.infer<typeof dataPlaneSchema>;
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
