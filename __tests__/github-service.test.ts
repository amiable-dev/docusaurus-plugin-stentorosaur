/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {GitHubStatusService} from '../src/github-service';
import {Octokit} from '@octokit/rest';

// Mock the Octokit module
jest.mock('@octokit/rest');

describe('GitHubStatusService', () => {
  let service: GitHubStatusService;
  let mockOctokit: jest.Mocked<Octokit>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a mock Octokit instance
    mockOctokit = {
      issues: {
        listForRepo: jest.fn(),
      },
    } as any;

    // Mock the Octokit constructor
    (Octokit as jest.MockedClass<typeof Octokit>).mockImplementation(() => mockOctokit);

    service = new GitHubStatusService(
      'test-token',
      'test-owner',
      'test-repo',
      'status',
      ['api', 'web', 'database']
    );
  });

  describe('fetchStatusData', () => {
    it('should fetch and parse GitHub issues', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'API Server Down',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'critical'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: 'API is experiencing issues',
        },
        {
          number: 2,
          title: 'Web Server Operational',
          state: 'closed',
          labels: [{name: 'status'}, {name: 'web'}, {name: 'resolved'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T02:00:00Z',
          closed_at: '2025-01-01T02:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/2',
          body: 'All systems operational',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        labels: 'status',
        state: 'all',
        per_page: 100,
        headers: {
          'If-None-Match': '',
        },
      });

      expect(result.items).toBeDefined();
      expect(result.incidents).toBeDefined();
      expect(result.incidents.length).toBe(2);
    });

    it('should create status items for configured systems', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'API Issue',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'major'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: 'Issue description',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      expect(result.items).toEqual([
        {name: 'api', status: 'degraded', incidentCount: 1},
        {name: 'web', status: 'up', incidentCount: 0},
        {name: 'database', status: 'up', incidentCount: 0},
      ]);
    });

    it('should map issue labels to status item status', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Critical Issue',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'critical'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: 'Critical issue',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      const apiItem = result.items.find(item => item.name === 'api');
      expect(apiItem?.status).toBe('down');
    });

    it('should convert GitHub issues to StatusIncident format', async () => {
      const mockIssues = [
        {
          number: 123,
          title: 'Test Incident',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'major'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/123',
          body: 'Incident body',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      expect(result.incidents[0]).toMatchObject({
        id: 123,
        title: 'Test Incident',
        status: 'open',
        severity: 'major',
        url: 'https://github.com/test-owner/test-repo/issues/123',
        body: 'Incident body',
      });
    });

    it('should handle API errors gracefully', async () => {
      mockOctokit.issues.listForRepo.mockRejectedValue(
        new Error('API Error')
      );

      // Service catches errors and returns empty array, not throwing
      const result = await service.fetchStatusData();
      
      expect(result.incidents).toEqual([]);
      expect(result.items).toEqual([
        {name: 'api', status: 'up', incidentCount: 0},
        {name: 'web', status: 'up', incidentCount: 0},
        {name: 'database', status: 'up', incidentCount: 0},
      ]);
    });

    it('should filter issues by status label', async () => {
      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: [],
      } as any);

      await service.fetchStatusData();

      expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({
          labels: 'status',
        })
      );
    });

    it('should handle empty response', async () => {
      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: [],
      } as any);

      const result = await service.fetchStatusData();

      expect(result.items).toEqual([
        {name: 'api', status: 'up', incidentCount: 0},
        {name: 'web', status: 'up', incidentCount: 0},
        {name: 'database', status: 'up', incidentCount: 0},
      ]);
      expect(result.incidents).toEqual([]);
    });

    it('should extract affected systems from labels', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Multi-system issue',
          state: 'open',
          labels: [
            {name: 'status'},
            {name: 'api'},
            {name: 'database'},
            {name: 'major'},
          ],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: 'Issue affecting multiple systems',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      expect(result.incidents[0].affectedSystems).toContain('api');
      expect(result.incidents[0].affectedSystems).toContain('database');
    });

    it('should prioritize critical status over degraded', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Critical API Issue',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'critical'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
        },
        {
          number: 2,
          title: 'Major API Issue',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'major'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T02:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/2',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      const apiItem = result.items.find(item => item.name === 'api');
      expect(apiItem?.status).toBe('down'); // Critical takes priority
      expect(apiItem?.incidentCount).toBe(2);
    });

    it('should handle maintenance severity correctly', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Scheduled Maintenance',
          state: 'open',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      expect(result.incidents[0].severity).toBe('maintenance');
      const apiItem = result.items.find(item => item.name === 'api');
      expect(apiItem?.status).toBe('maintenance');
    });

    it('should calculate resolution time for closed incidents', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Resolved Issue',
          state: 'closed',
          labels: [{name: 'status'}, {name: 'api'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T02:00:00Z',
          closed_at: '2025-01-01T02:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      expect(result.incidents[0].resolutionTimeMinutes).toBe(120); // 2 hours
      expect(result.incidents[0].closedAt).toBe('2025-01-01T02:00:00Z');
    });

    it('should not affect status for closed incidents', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Closed Critical Issue',
          state: 'closed',
          labels: [{name: 'status'}, {name: 'api'}, {name: 'critical'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T02:00:00Z',
          closed_at: '2025-01-01T02:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      const result = await service.fetchStatusData();

      const apiItem = result.items.find(item => item.name === 'api');
      expect(apiItem?.status).toBe('up'); // Closed incidents don't affect status
    });
  });

  describe('fetchScheduledMaintenance', () => {
    beforeEach(() => {
      mockOctokit.issues = {
        ...mockOctokit.issues,
        listComments: jest.fn(),
      } as any;
    });

    it('should fetch maintenance issues', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Database Upgrade',
          state: 'open',
          labels: [{name: 'scheduled-maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: '---\nstart: 2025-12-01T02:00:00Z\nend: 2025-12-01T04:00:00Z\nsystems: [database]\n---\nMaintenance description',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      const result = await service.fetchScheduledMaintenance();

      expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        labels: 'scheduled-maintenance',
        state: 'all',
        per_page: 100,
        sort: 'created',
        direction: 'desc',
        headers: {
          'If-None-Match': '',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Database Upgrade');
    });

    it('should handle maintenance fetch errors gracefully', async () => {
      mockOctokit.issues.listForRepo.mockRejectedValue(
        new Error('API Error')
      );

      const result = await service.fetchScheduledMaintenance();

      expect(result).toEqual([]);
    });

    it('should filter out invalid maintenance issues', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Invalid - No dates',
          state: 'open',
          labels: [{name: 'scheduled-maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: 'No frontmatter',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      const result = await service.fetchScheduledMaintenance();

      expect(result).toEqual([]);
    });

    it('should fetch and include issue comments', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Maintenance with comments',
          state: 'open',
          labels: [{name: 'scheduled-maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: '---\nstart: 2025-12-01T02:00:00Z\nend: 2025-12-01T04:00:00Z\n---\nDescription',
        },
      ];

      const mockComments = [
        {
          user: {login: 'admin'},
          created_at: '2025-01-01T01:30:00Z',
          body: '---\ntype: update\n---\nMaintenance update',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.issues.listComments.mockResolvedValue({
        data: mockComments,
      } as any);

      const result = await service.fetchScheduledMaintenance();

      expect(mockOctokit.issues.listComments).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 1,
        per_page: 100,
      });

      expect(result[0].comments).toHaveLength(1);
    });

    it('should handle comment fetch errors gracefully', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Maintenance',
          state: 'open',
          labels: [{name: 'scheduled-maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: '---\nstart: 2025-12-01T02:00:00Z\nend: 2025-12-01T04:00:00Z\n---\nDescription',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.issues.listComments.mockRejectedValue(
        new Error('Comment fetch error')
      );

      const result = await service.fetchScheduledMaintenance();

      expect(result[0].comments).toEqual([]);
    });

    it('should sort maintenance by start time descending', async () => {
      const mockIssues = [
        {
          number: 1,
          title: 'Earlier Maintenance',
          state: 'open',
          labels: [{name: 'scheduled-maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/1',
          body: '---\nstart: 2025-11-01T02:00:00Z\nend: 2025-11-01T04:00:00Z\n---\nEarlier',
        },
        {
          number: 2,
          title: 'Later Maintenance',
          state: 'open',
          labels: [{name: 'scheduled-maintenance'}],
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T01:00:00Z',
          html_url: 'https://github.com/test-owner/test-repo/issues/2',
          body: '---\nstart: 2025-12-01T02:00:00Z\nend: 2025-12-01T04:00:00Z\n---\nLater',
        },
      ];

      mockOctokit.issues.listForRepo.mockResolvedValue({
        data: mockIssues,
      } as any);

      mockOctokit.issues.listComments.mockResolvedValue({
        data: [],
      } as any);

      const result = await service.fetchScheduledMaintenance();

      expect(result[0].title).toBe('Later Maintenance');
      expect(result[1].title).toBe('Earlier Maintenance');
    });
  });
});
