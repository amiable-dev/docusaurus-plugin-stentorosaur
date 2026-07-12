/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Label parsing utilities for entity identification
 */

import type { Entity, EntityType, LabelScheme } from './types';

export class LabelParser {
  private scheme: LabelScheme;

  constructor(scheme?: Partial<LabelScheme>) {
    this.scheme = {
      separator: scheme?.separator || ':',
      defaultType: scheme?.defaultType || 'system',
      allowUntyped: scheme?.allowUntyped ?? true,
    };
  }

  /**
   * Parse GitHub label to extract entity type and name
   *
   * Supports two formats:
   * 1. Namespaced (explicit type): 'system:api', 'process:onboarding'
   * 2. Simple (uses defaultType): 'api', 'onboarding'
   *
   * Examples:
   *   'api' → { type: 'system', name: 'api' } (defaultType='system')
   *   'system:api' → { type: 'system', name: 'api' }
   *   'process:onboarding' → { type: 'process', name: 'onboarding' }
   *   'onboarding' → { type: 'system', name: 'onboarding' } (fallback to defaultType)
   *
   * Simple labels reduce overhead and allow naming collision validation in config.
   */
  parseLabel(label: string): { type: EntityType; name: string } | null {
    const { separator, defaultType, allowUntyped } = this.scheme;

    // Check if label contains separator
    if (label.includes(separator)) {
      const [typeStr, ...nameParts] = label.split(separator);
      const name = nameParts.join(separator); // Handle names with separators

      // Validate type
      const validTypes: EntityType[] = ['system', 'process', 'project', 'event', 'sla', 'custom'];
      if (validTypes.includes(typeStr as EntityType)) {
        return {
          type: typeStr as EntityType,
          name: name,
        };
      }
    }

    // Handle untyped labels
    if (allowUntyped) {
      return {
        type: defaultType,
        name: label,
      };
    }

    return null; // Invalid label
  }

  /**
   * Extract entities from GitHub issue labels
   * Returns array of entity identifiers affected by the issue
   */
  extractEntitiesFromLabels(
    labels: string[],
    knownEntities: Entity[]
  ): Array<{ type: EntityType; name: string }> {
    const entities: Array<{ type: EntityType; name: string }> = [];
    const entityNames = new Set(knownEntities.map(e => e.name));

    for (const label of labels) {
      const parsed = this.parseLabel(label);

      if (parsed && entityNames.has(parsed.name)) {
        entities.push(parsed);
      }
    }

    return entities;
  }
}
