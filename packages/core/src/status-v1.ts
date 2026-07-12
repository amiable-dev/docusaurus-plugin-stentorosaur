/**
 * status/v1 — the single canonical data contract (ADR-005 §2).
 *
 * Everything the data branch serves is validated against these schemas on
 * write AND read. `schemaVersion` gates major migrations: minor additive
 * fields are tolerated (unknown keys are stripped, never fatal), while an
 * unknown major version fails loudly with an actionable message.
 *
 * File layout on the data branch:
 *   status/v1/summary.json          — parseSummary (the client's one fetch)
 *   status/v1/entities/<name>.json  — parseEntityDetail (on card expand)
 *   status/v1/raw/<issue>.json      — parseRawIncidentBody (provenance for
 *                                     re-rendering after sanitizer CVEs, §7)
 */

import {z} from 'zod';

export const STATUS_SCHEMA_VERSION = 1;

/** Entity/reading state — matches CompactReading.state. */
export const entityStateSchema = z.enum(['up', 'degraded', 'down', 'maintenance']);

const isoDateTime = z.string().refine(s => !Number.isNaN(Date.parse(s)), {
  message: 'must be an ISO 8601 datetime',
});
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), {
    message: 'must be a valid calendar date',
  });

/**
 * One-character worst-state codes for the compact day encoding.
 * The verbose object form (`{date, uptime, avgMs, worst}` × 90 × N
 * entities) measured ~29 KB for five entities — triple the ADR-005 §2
 * summary budget — so days ship as `[uptime, avgMs, worstChar]` tuples
 * anchored by a single `daysEnd` date per entity.
 */
export const WORST_CODES = {u: 'up', g: 'degraded', d: 'down', m: 'maintenance'} as const;
export type WorstCode = keyof typeof WORST_CODES;

/** Compact day tuple: [uptime 0-100, avgMs|null, worst-state code]. */
export const dayTupleSchema = z.tuple([
  z.number().min(0).max(100),
  z.number().nullable(),
  z.enum(['u', 'g', 'd', 'm']),
]);
export type DayTuple = z.infer<typeof dayTupleSchema>;

/** Decoded day rollup (ergonomic client shape — see decodeDayRollups). */
export interface DayRollup {
  date: string;
  /** Uptime percentage 0-100 */
  uptime: number;
  /** Average latency over 'up' checks; null when none (or not probed) */
  avgMs: number | null;
  /** Worst state observed that day */
  worst: (typeof WORST_CODES)[WorstCode];
}

export const summaryEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['system', 'process']),
  displayName: z.string().optional(),
  status: entityStateSchema,
  uptime: z.object({
    d1: z.number().min(0).max(100),
    d7: z.number().min(0).max(100),
    d90: z.number().min(0).max(100),
  }),
  responseTimeMs: z.object({
    d1: z.number().nullable(),
  }),
  /** UTC date (YYYY-MM-DD) of the LAST entry in days */
  daysEnd: isoDate,
  /** Daily rollups oldest→newest as compact tuples, at most 90 */
  days: z.array(dayTupleSchema).max(90),
});

export const incidentSchema = z.object({
  issueNumber: z.number().int().positive(),
  title: z.string(),
  severity: z.enum(['critical', 'major', 'minor']),
  status: z.enum(['open', 'resolved']),
  entities: z.array(z.string()),
  createdAt: isoDateTime,
  closedAt: isoDateTime.nullable(),
  /** Sanitized at WRITE time (ADR-005 §2); raw markdown lives in raw/ */
  bodyHtml: z.string(),
});

export const maintenanceWindowSchema = z.object({
  issueNumber: z.number().int().positive(),
  title: z.string(),
  start: isoDateTime,
  end: isoDateTime,
  status: z.enum(['upcoming', 'in-progress', 'completed']),
  entities: z.array(z.string()),
  bodyHtml: z.string(),
});

export const summarySchema = z.object({
  schemaVersion: z.literal(STATUS_SCHEMA_VERSION),
  generatedAt: isoDateTime,
  generatedBy: z.string(),
  entities: z.array(summaryEntitySchema),
  incidents: z.object({
    open: z.array(incidentSchema),
    recent: z.array(incidentSchema),
  }),
  maintenance: z.object({
    upcoming: z.array(maintenanceWindowSchema),
    inProgress: z.array(maintenanceWindowSchema),
  }),
});

export const entityDetailSchema = z.object({
  schemaVersion: z.literal(STATUS_SCHEMA_VERSION),
  generatedAt: isoDateTime,
  name: z.string().min(1),
  readings: z.array(
    z.object({
      t: z.number(),
      svc: z.string(),
      state: entityStateSchema,
      code: z.number(),
      lat: z.number(),
      err: z.string().optional(),
    })
  ),
});

export const rawIncidentBodySchema = z.object({
  schemaVersion: z.literal(STATUS_SCHEMA_VERSION),
  issueNumber: z.number().int().positive(),
  updatedAt: isoDateTime,
  bodyMarkdown: z.string(),
});

export type StatusSummary = z.infer<typeof summarySchema>;
export type SummaryEntity = z.infer<typeof summaryEntitySchema>;
export type StatusIncidentV1 = z.infer<typeof incidentSchema>;
export type MaintenanceWindowV1 = z.infer<typeof maintenanceWindowSchema>;
export type EntityDetail = z.infer<typeof entityDetailSchema>;
export type RawIncidentBody = z.infer<typeof rawIncidentBodySchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_BY_STATE = Object.fromEntries(
  Object.entries(WORST_CODES).map(([code, state]) => [state, code])
) as Record<(typeof WORST_CODES)[WorstCode], WorstCode>;

/**
 * Encode decoded rollups (oldest→newest, contiguous UTC days) into the
 * compact wire form. The writer-side counterpart of decodeDayRollups.
 */
export function encodeDayRollups(rollups: DayRollup[]): {
  daysEnd: string;
  days: DayTuple[];
} {
  if (rollups.length === 0) {
    throw new Error('encodeDayRollups: at least one day is required');
  }
  return {
    daysEnd: rollups[rollups.length - 1].date,
    days: rollups.map(r => [r.uptime, r.avgMs, CODE_BY_STATE[r.worst]]),
  };
}

/**
 * Decode an entity's compact day tuples back into dated rollups by
 * walking backward from daysEnd (contiguous UTC days).
 */
export function decodeDayRollups(
  entity: Pick<SummaryEntity, 'daysEnd' | 'days'>
): DayRollup[] {
  const end = Date.parse(`${entity.daysEnd}T00:00:00Z`);
  const count = entity.days.length;
  return entity.days.map(([uptime, avgMs, code], i) => ({
    date: new Date(end - (count - 1 - i) * DAY_MS).toISOString().split('T')[0],
    uptime,
    avgMs,
    worst: WORST_CODES[code],
  }));
}

/**
 * Gate on schemaVersion BEFORE full validation so version skew produces
 * an actionable message instead of a wall of field errors.
 */
function checkVersion(input: unknown, what: string): void {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`${what}: expected an object, got ${typeof input}`);
  }
  const version = (input as Record<string, unknown>).schemaVersion;
  if (version === undefined) {
    throw new Error(
      `${what}: missing schemaVersion — not a status/v1 file, or produced by a pre-v1 writer. Run 'stentorosaur migrate' to convert legacy data.`
    );
  }
  if (version !== STATUS_SCHEMA_VERSION) {
    throw new Error(
      `${what}: unsupported schemaVersion ${String(version)}; this reader supports ${STATUS_SCHEMA_VERSION}. ` +
        `Upgrade @stentorosaur/core, or regenerate the data branch with a matching writer.`
    );
  }
}

function parseWith<T>(schema: z.ZodType<T>, input: unknown, what: string): T {
  checkVersion(input, what);
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`${what}: invalid status/v1 payload\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function parseSummary(input: unknown): StatusSummary {
  return parseWith(summarySchema, input, 'summary.json');
}

export function parseEntityDetail(input: unknown): EntityDetail {
  return parseWith(entityDetailSchema, input, 'entity detail');
}

export function parseRawIncidentBody(input: unknown): RawIncidentBody {
  return parseWith(rawIncidentBodySchema, input, 'raw incident body');
}
