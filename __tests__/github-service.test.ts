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
  });
});
