/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { LabelParser } from '../src/label-utils';
import type { Entity } from '../src/types';

describe('LabelParser', () => {
  describe('parseLabel', () => {
    const parser = new LabelParser();

    it('parses typed labels', () => {
      const result = parser.parseLabel('system:api');
      expect(result).toEqual({ type: 'system', name: 'api' });
    });

    it('parses process labels', () => {
      const result = parser.parseLabel('process:customer-onboarding');
      expect(result).toEqual({ type: 'process', name: 'customer-onboarding' });
    });

    it('parses project labels', () => {
      const result = parser.parseLabel('project:migration');
      expect(result).toEqual({ type: 'project', name: 'migration' });
    });

    it('parses event labels', () => {
      const result = parser.parseLabel('event:black-friday');
      expect(result).toEqual({ type: 'event', name: 'black-friday' });
    });

    it('parses sla labels', () => {
      const result = parser.parseLabel('sla:uptime');
      expect(result).toEqual({ type: 'sla', name: 'uptime' });
    });

    it('parses custom labels', () => {
      const result = parser.parseLabel('custom:special');
      expect(result).toEqual({ type: 'custom', name: 'special' });
    });

    it('handles untyped labels with default', () => {
      const result = parser.parseLabel('api');
      expect(result).toEqual({ type: 'system', name: 'api' });
    });

    it('handles custom separator', () => {
      const parser = new LabelParser({ separator: '/' });
      const result = parser.parseLabel('process/onboarding');
      expect(result).toEqual({ type: 'process', name: 'onboarding' });
    });

    it('handles custom default type', () => {
      const parser = new LabelParser({ defaultType: 'process' });
      const result = parser.parseLabel('onboarding');
      expect(result).toEqual({ type: 'process', name: 'onboarding' });
    });

    it('rejects invalid types when untyped not allowed', () => {
      const parser = new LabelParser({ allowUntyped: false });
      const result = parser.parseLabel('api');
      expect(result).toBeNull();
    });

    it('treats invalid type prefixes as untyped (fallback to default type)', () => {
      // When allowUntyped is true (default), invalid prefixes fall back to treating the whole label as a name
      const result = parser.parseLabel('invalid:api');
      expect(result).toEqual({ type: 'system', name: 'invalid:api' });
    });

    it('handles names with separators', () => {
      const result = parser.parseLabel('project:migration:v2:to:aurora');
      expect(result).toEqual({ type: 'project', name: 'migration:v2:to:aurora' });
    });

    it('handles empty string', () => {
      const parser = new LabelParser({ allowUntyped: false });
      const result = parser.parseLabel('');
      expect(result).toBeNull();
    });
  });

  describe('extractEntitiesFromLabels', () => {
    const parser = new LabelParser();
    const knownEntities: Entity[] = [
      { name: 'api', type: 'system' },
      { name: 'customer-onboarding', type: 'process' },
      { name: 'migration', type: 'project' },
    ];

    it('extracts multiple entity types', () => {
      const labels = [
        'system:api',
        'process:customer-onboarding',
        'severity:critical',
        'status',
      ];

      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(2);
      expect(extracted).toContainEqual({ type: 'system', name: 'api' });
      expect(extracted).toContainEqual({ type: 'process', name: 'customer-onboarding' });
    });

    it('handles untyped labels', () => {
      const labels = ['api', 'status'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toEqual({ type: 'system', name: 'api' });
    });

    it('ignores unknown entities', () => {
      const labels = ['system:unknown', 'process:customer-onboarding'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(1);
      expect(extracted[0].name).toBe('customer-onboarding');
    });

    it('handles empty labels array', () => {
      const extracted = parser.extractEntitiesFromLabels([], knownEntities);
      expect(extracted).toEqual([]);
    });

    it('handles empty entities array', () => {
      const labels = ['system:api', 'process:onboarding'];
      const extracted = parser.extractEntitiesFromLabels(labels, []);
      expect(extracted).toEqual([]);
    });

    it('handles labels with no entity matches', () => {
      const labels = ['severity:critical', 'status', 'priority:high'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);
      expect(extracted).toEqual([]);
    });

    it('handles duplicate entity references', () => {
      const labels = ['api', 'system:api'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      // Should return both matches (not deduplicated)
      expect(extracted).toHaveLength(2);
      expect(extracted).toContainEqual({ type: 'system', name: 'api' });
    });

    it('preserves order of extraction', () => {
      const labels = ['process:customer-onboarding', 'api', 'project:migration'];
      const extracted = parser.extractEntitiesFromLabels(labels, knownEntities);

      expect(extracted).toHaveLength(3);
      expect(extracted[0]).toEqual({ type: 'process', name: 'customer-onboarding' });
      expect(extracted[1]).toEqual({ type: 'system', name: 'api' });
      expect(extracted[2]).toEqual({ type: 'project', name: 'migration' });
    });
  });

  describe('constructor defaults', () => {
    it('uses default separator', () => {
      const parser = new LabelParser();
      const result = parser.parseLabel('system:api');
      expect(result).toEqual({ type: 'system', name: 'api' });
    });

    it('uses default type', () => {
      const parser = new LabelParser();
      const result = parser.parseLabel('unlabeled');
      expect(result).toEqual({ type: 'system', name: 'unlabeled' });
    });

    it('allows untyped by default', () => {
      const parser = new LabelParser();
      const result = parser.parseLabel('api');
      expect(result).not.toBeNull();
    });

    it('can override all defaults', () => {
      const parser = new LabelParser({
        separator: '/',
        defaultType: 'process',
        allowUntyped: false,
      });

      const result1 = parser.parseLabel('process/onboarding');
      expect(result1).toEqual({ type: 'process', name: 'onboarding' });

      const result2 = parser.parseLabel('unlabeled');
      expect(result2).toBeNull();
    });
  });
});
