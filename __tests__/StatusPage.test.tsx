/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatusPage from '../src/theme/StatusPage';
import type { StatusData } from '../src/types';

// Mock Layout component
jest.mock('@theme/Layout', () => ({
  __esModule: true,
  default: ({ children, title, description }: any) => (
    <div data-testid="layout" data-title={title} data-description={description}>
      {children}
    </div>
  ),
}));

describe('StatusPage (default view)', () => {
  const mockStatusData: StatusData = {
    items: [
      {
        name: 'API',
        status: 'up',
        description: 'API Service',
        uptime: '99.9%',
      },
      {
        name: 'Database',
        status: 'up',
        description: 'Database Service',
        uptime: '99.8%',
      },
    ],
    incidents: [
      {
        id: 1,
        title: 'API Degraded Performance',
        status: 'closed',
        severity: 'minor',
        createdAt: '2025-01-01T10:00:00Z',
        updatedAt: '2025-01-01T12:00:00Z',
        closedAt: '2025-01-01T12:00:00Z',
        url: 'https://github.com/test/test/issues/1',
        labels: ['status', 'minor'],
        affectedSystems: ['api'],
      },
    ],
    maintenance: [
      {
        id: 10,
        title: 'Database Upgrade',
        start: '2025-01-15T02:00:00Z',
        end: '2025-01-15T04:00:00Z',
        status: 'upcoming',
        affectedSystems: ['database'],
        description: 'Upgrading database to version 2.0',
        comments: [],
        url: 'https://github.com/test/test/issues/10',
        createdAt: '2025-01-10T10:00:00Z',
      },
      {
        id: 11,
        title: 'API Server Migration',
        start: '2025-01-05T02:00:00Z',
        end: '2025-01-05T04:00:00Z',
        status: 'completed',
        affectedSystems: ['api'],
        description: 'Migrated API servers to new infrastructure',
        comments: [],
        url: 'https://github.com/test/test/issues/11',
        createdAt: '2025-01-03T10:00:00Z',
      },
    ],
    lastUpdated: '2025-01-10T10:00:00Z',
    showServices: true,
    showIncidents: true,
    showPerformanceMetrics: true,
    useDemoData: false,
  };

  it('renders status board with systems', () => {
    render(<StatusPage statusData={mockStatusData} />);

    // Check that systems are displayed
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
  });

  it('renders incident history', () => {
    render(<StatusPage statusData={mockStatusData} />);

    // Check that incident is displayed
    expect(screen.getByText('API Degraded Performance')).toBeInTheDocument();
  });

  it('renders upcoming scheduled maintenance', () => {
    render(<StatusPage statusData={mockStatusData} />);

    // Check that upcoming maintenance is displayed
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Database Upgrade')).toBeInTheDocument();
    expect(screen.getByText('Upgrading database to version 2.0')).toBeInTheDocument();
  });

  it('renders past maintenance separately', () => {
    render(<StatusPage statusData={mockStatusData} />);

    // Check that past maintenance is displayed
    expect(screen.getByText('Past Maintenance')).toBeInTheDocument();
    expect(screen.getByText('API Server Migration')).toBeInTheDocument();
  });

  it('does not render maintenance sections when no maintenance data', () => {
    const dataWithoutMaintenance: StatusData = {
      ...mockStatusData,
      maintenance: [],
    };

    render(<StatusPage statusData={dataWithoutMaintenance} />);

    // Check that maintenance sections are NOT displayed
    expect(screen.queryByText('Scheduled Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('Past Maintenance')).not.toBeInTheDocument();
  });

  it('correctly splits maintenance by status', () => {
    const dataWithMixedMaintenance: StatusData = {
      ...mockStatusData,
      maintenance: [
        {
          id: 10,
          title: 'Upcoming Work',
          start: '2025-01-15T02:00:00Z',
          end: '2025-01-15T04:00:00Z',
          status: 'upcoming',
          affectedSystems: ['api'],
          description: 'Upcoming maintenance',
          comments: [],
          url: 'https://github.com/test/test/issues/10',
          createdAt: '2025-01-10T10:00:00Z',
        },
        {
          id: 11,
          title: 'In Progress Work',
          start: '2025-01-10T02:00:00Z',
          end: '2025-01-10T04:00:00Z',
          status: 'in-progress',
          affectedSystems: ['database'],
          description: 'Currently in progress',
          comments: [],
          url: 'https://github.com/test/test/issues/11',
          createdAt: '2025-01-09T10:00:00Z',
        },
        {
          id: 12,
          title: 'Completed Work',
          start: '2025-01-05T02:00:00Z',
          end: '2025-01-05T04:00:00Z',
          status: 'completed',
          affectedSystems: ['api'],
          description: 'Already done',
          comments: [],
          url: 'https://github.com/test/test/issues/12',
          createdAt: '2025-01-03T10:00:00Z',
        },
      ],
    };

    render(<StatusPage statusData={dataWithMixedMaintenance} />);

    // Upcoming and in-progress should be in "Scheduled Maintenance"
    const scheduledSection = screen.getByText('Scheduled Maintenance').parentElement;
    expect(scheduledSection).toHaveTextContent('Upcoming Work');
    expect(scheduledSection).toHaveTextContent('In Progress Work');
    expect(scheduledSection).not.toHaveTextContent('Completed Work');

    // Completed should be in "Past Maintenance"
    const pastSection = screen.getByText('Past Maintenance').parentElement;
    expect(pastSection).toHaveTextContent('Completed Work');
    expect(pastSection).not.toHaveTextContent('Upcoming Work');
    expect(pastSection).not.toHaveTextContent('In Progress Work');
  });

  it('respects showServices flag', () => {
    const dataWithServicesHidden: StatusData = {
      ...mockStatusData,
      showServices: false,
    };

    render(<StatusPage statusData={dataWithServicesHidden} />);

    // Services should not be displayed
    expect(screen.queryByText('API')).not.toBeInTheDocument();
    expect(screen.queryByText('Database')).not.toBeInTheDocument();

    // But maintenance should still be visible
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
  });

  it('respects showIncidents flag', () => {
    const dataWithIncidentsHidden: StatusData = {
      ...mockStatusData,
      showIncidents: false,
    };

    render(<StatusPage statusData={dataWithIncidentsHidden} />);

    // Incidents should not be displayed
    expect(screen.queryByText('API Degraded Performance')).not.toBeInTheDocument();

    // But maintenance should still be visible
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
  });
});
