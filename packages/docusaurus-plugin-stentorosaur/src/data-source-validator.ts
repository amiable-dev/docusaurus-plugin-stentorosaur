/**
 * ADR-001: Data Source Validator
 *
 * Provides:
 * - Zod schema validation for fetched status data (Issue #43)
 * - Security validation for data sources (Issue #44)
 *
 * @see docs/adrs/ADR-001-configurable-data-fetching-strategies.md
 */

import { z } from 'zod';
import type { DataSource } from './types';

/**
 * Maximum payload size in bytes (1MB)
 * Prevents DoS from oversized responses
 */
export const MAX_PAYLOAD_SIZE = 1_000_000;

/**
 * Headers that may contain sensitive credentials
 * Used to warn users about potential security issues
 */
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'api-key',
  'apikey',
  'token',
  'bearer',
];

/**
 * Service status schema
 */
const ServiceSchema = z.object({
  name: z.string().max(100),
  status: z.enum(['operational', 'degraded', 'outage', 'maintenance']),
  latency: z.number().optional(),
  description: z.string().optional(),
}).transform((data) => {
  // Strip any extra fields - only keep known fields
  const { name, status, latency } = data;
  return { name, status, ...(latency !== undefined ? { latency } : {}) };
});

/**
 * Status data schema with size validation
 *
 * Validates:
 * - Required services array
 * - Optional timestamp
 * - Maximum 100 services
 * - Maximum 1MB total payload size
 */
export const StatusDataSchema = z.object({
  services: z.array(ServiceSchema).max(100),
  timestamp: z.string().datetime().optional(),
}).refine(
  (data) => {
    // Check total payload size
    const jsonString = JSON.stringify(data);
    return jsonString.length < MAX_PAYLOAD_SIZE;
  },
  {
    message: `Status data exceeds maximum size of ${MAX_PAYLOAD_SIZE} bytes (1MB)`,
  }
);

/**
 * Inferred type from StatusDataSchema
 */
export type ValidatedStatusData = z.infer<typeof StatusDataSchema>;

/**
 * Validate status data against the schema.
 *
 * @param data - Raw data to validate
 * @returns Validated and sanitized status data
 * @throws Error if validation fails
 */
export function validateStatusData(data: unknown): ValidatedStatusData {
  const result = StatusDataSchema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues;
    const errorMessages = issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid status data: ${errorMessages || 'Validation failed'}`);
  }

  return result.data;
}

/**
 * Security validation options
 */
export interface SecurityValidationOptions {
  /** Execution context */
  context: 'production' | 'development';
  /** Protocol of the host site (for mixed content detection) */
  siteProtocol?: 'https:' | 'http:';
}

/**
 * Validate data source configuration for security issues.
 *
 * Checks:
 * - HTTPS enforcement in production
 * - Sensitive headers exposure
 * - Mixed content warnings
 *
 * @param dataSource - Data source configuration
 * @param options - Validation options
 */
export function validateDataSourceSecurity(
  dataSource: DataSource,
  options: SecurityValidationOptions
): void {
  // Only validate http strategy - others are secure by design
  if (dataSource.strategy !== 'http') {
    return;
  }

  const { url, headers } = dataSource;
  const { context, siteProtocol } = options;

  // Check for insecure HTTP in production
  if (context === 'production' && url.startsWith('http://')) {
    // Check for mixed content
    if (siteProtocol === 'https:') {
      console.warn(
        `[Stentorosaur] Security Warning: Fetching from http:// URL will be blocked on HTTPS sites due to mixed content policy. ` +
        `URL: ${url}`
      );
    } else {
      console.warn(
        `[Stentorosaur] Security Warning: Using http:// URL in production. HTTPS is recommended for security. ` +
        `URL: ${url}`
      );
    }
  }

  // Check for sensitive headers
  if (headers) {
    const sensitiveHeadersFound = Object.keys(headers)
      .filter((header) =>
        SENSITIVE_HEADERS.some((sensitive) =>
          header.toLowerCase().includes(sensitive)
        )
      );

    if (sensitiveHeadersFound.length > 0) {
      console.warn(
        `[Stentorosaur] Security Warning: Headers containing potential secrets detected: ${sensitiveHeadersFound.join(', ')}. ` +
        `These headers will be exposed in the client bundle. ` +
        `Use a server-side proxy to add authentication headers securely.`
      );
    }
  }
}

/**
 * Validate raw JSON response before parsing.
 *
 * @param responseText - Raw response text
 * @returns Parsed and validated status data
 * @throws Error if response is too large or invalid
 */
export function validateAndParseResponse(responseText: string): ValidatedStatusData {
  // Check size before parsing
  if (responseText.length > MAX_PAYLOAD_SIZE) {
    throw new Error(
      `Response exceeds maximum size of ${MAX_PAYLOAD_SIZE} bytes (1MB). ` +
      `Received: ${responseText.length} bytes`
    );
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${(error as Error).message}`);
  }

  // Validate against schema
  return validateStatusData(data);
}
