/**
 * Label parsing for entity identification (ported from the plugin's
 * label-utils in ticket #68; the plugin copy is deleted at the v1.0
 * cutover, #77). Pure and client-safe.
 */

export type EntityType = 'system' | 'process' | 'project' | 'event' | 'sla' | 'custom';

export interface LabelScheme {
  separator: string;
  defaultType: EntityType;
  allowUntyped: boolean;
}

/** Minimal entity reference used by the transforms. */
export interface EntityRef {
  name: string;
  type: 'system' | 'process';
  displayName?: string;
}

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
   * Parse a GitHub label into an entity type + name.
   * Namespaced ('system:api') and simple ('api', via defaultType) forms.
   */
  parseLabel(label: string): {type: EntityType; name: string} | null {
    const {separator, defaultType, allowUntyped} = this.scheme;

    if (label.includes(separator)) {
      const [typeStr, ...nameParts] = label.split(separator);
      const name = nameParts.join(separator); // names may contain the separator

      const validTypes: EntityType[] = ['system', 'process', 'project', 'event', 'sla', 'custom'];
      if (validTypes.includes(typeStr as EntityType)) {
        return {type: typeStr as EntityType, name};
      }
    }

    if (allowUntyped) {
      return {type: defaultType, name: label};
    }

    return null;
  }

  /** Extract known-entity references from a label set. */
  extractEntitiesFromLabels(
    labels: string[],
    knownEntities: Array<{name: string}>
  ): Array<{type: EntityType; name: string}> {
    const entityNames = new Set(knownEntities.map(e => e.name));
    const entities: Array<{type: EntityType; name: string}> = [];

    for (const label of labels) {
      const parsed = this.parseLabel(label);
      if (parsed && entityNames.has(parsed.name)) {
        entities.push(parsed);
      }
    }
    return entities;
  }
}
