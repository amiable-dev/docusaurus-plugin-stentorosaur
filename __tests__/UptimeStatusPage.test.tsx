/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UptimeStatusPage from '../src/theme/UptimeStatusPage';
import type { StatusData } from '../src/types';

describe('UptimeStatusPage', () => {
  const sampleStatusData: StatusData = {
    items: [
      {
        name: 'API Service',
        status: 'up',
        uptime: '99.9%',
        responseTime: 120,
      },
      {
        name: 'Database',
        status: 'degraded',
        uptime: '98.5%',
        responseTime: 250,
      },
    ],
    incidents: [
      {
        id: 1,
        title: 'Active Issue',
        status: 'open',
        severity: 'major',
        createdAt: '2025-11-04T10:00:00Z',
        updatedAt: '2025-11-04T11:00:00Z',
        url: 'https://github.com/example/repo/issues/1',
        labels: [],
        affectedSystems: ['Database'],
      },
      {
        id: 2,
        title: 'Resolved Issue',
        status: 'closed',
        severity: 'minor',
        createdAt: '2025-11-03T10:00:00Z',
        updatedAt: '2025-11-03T12:00:00Z',
        closedAt: '2025-11-03T12:00:00Z',
        url: 'https://github.com/example/repo/issues/2',
        labels: [],
        affectedSystems: ['API Service'],
        commentCount: 3,
        resolutionTimeMinutes: 120,
      },
    ],
    maintenance: [
      {
        id: 101,
        title: 'Upcoming Maintenance',
        start: '2025-12-01T02:00:00Z',
        end: '2025-12-01T04:00:00Z',
        status: 'upcoming',
        affectedSystems: ['API Service'],
        description: 'Planned upgrade',
        comments: [],
        url: 'https://github.com/example/repo/issues/101',
        createdAt: '2025-11-01T10:00:00Z',
      },
      {
        id: 102,
        title: 'Completed Maintenance',
        start: '2025-10-01T02:00:00Z',
        end: '2025-10-01T04:00:00Z',
        status: 'completed',
        affectedSystems: ['Database'],
        description: 'Database upgrade',
        comments: [],
        url: 'https://github.com/example/repo/issues/102',
        createdAt: '2025-09-28T10:00:00Z',
      },
    ],
    lastUpdated: '2025-11-04T12:00:00Z',
    overallStatus: 'degraded',
  };

  it('renders all sections by default', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    // Should render section titles
    expect(screen.getByText('Active Incidents')).toBeInTheDocument();
    expect(screen.getByText('Live Status')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Past Scheduled Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Past Incidents')).toBeInTheDocument();
  });

  it('displays active incidents', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    expect(screen.getByText('Active Issue')).toBeInTheDocument();
  });

  it('displays live status with systems', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    // Use getAllByText since system names appear multiple times
    const apiServices = screen.getAllByText('API Service');
    const databases = screen.getAllByText('Database');
    
    expect(apiServices.length).toBeGreaterThan(0);
    expect(databases.length).toBeGreaterThan(0);
  });

  it('displays overall status banner', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    expect(screen.getByText(/Some Systems Degraded/)).toBeInTheDocument();
  });

  it('displays scheduled maintenance', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    expect(screen.getByText('Upcoming Maintenance')).toBeInTheDocument();
  });

  it('displays past maintenance', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    expect(screen.getByText('Completed Maintenance')).toBeInTheDocument();
  });

  it('displays past incidents with resolution info', () => {
    render(<UptimeStatusPage statusData={sampleStatusData} />);
    
    expect(screen.getByText('Resolved Issue')).toBeInTheDocument();
  });

  it('hides sections when they have no data', () => {
    const emptyData: StatusData = {
      items: [],
      incidents: [],
      maintenance: [],
      lastUpdated: '2025-11-04T12:00:00Z',
      overallStatus: 'operational',
    };
    
    render(<UptimeStatusPage statusData={emptyData} />);
    
    // Active incidents section should not render when empty
    expect(screen.queryByText('Active Issue')).not.toBeInTheDocument();
    // But live status should still render
    expect(screen.getByText('Live Status')).toBeInTheDocument();
  });

  it('supports custom section titles', () => {
    const customConfig = {
      sections: [
        { id: 'active-incidents' as const, enabled: true },
        { id: 'live-status' as const, enabled: true },
        { id: 'charts' as const, enabled: true },
        { id: 'scheduled-maintenance' as const, enabled: true },
        { id: 'past-maintenance' as const, enabled: true },
        { id: 'past-incidents' as const, enabled: true },
      ],
      sectionTitles: {
        'active-incidents': 'Current Issues',
        'live-status': 'System Status',
      },
    };
    
    render(<UptimeStatusPage statusData={sampleStatusData} config={customConfig} />);
    
    expect(screen.getByText('Current Issues')).toBeInTheDocument();
    expect(screen.getByText('System Status')).toBeInTheDocument();
  });

  it('can disable sections', () => {
    const customConfig = {
      sections: [
        { id: 'active-incidents' as const, enabled: false },
        { id: 'live-status' as const, enabled: true },
        { id: 'charts' as const, enabled: false },
        { id: 'scheduled-maintenance' as const, enabled: false },
        { id: 'past-maintenance' as const, enabled: false },
        { id: 'past-incidents' as const, enabled: true },
      ],
    };
    
    render(<UptimeStatusPage statusData={sampleStatusData} config={customConfig} />);
    
    expect(screen.queryByText('Active Incidents')).not.toBeInTheDocument();
    expect(screen.getByText('Live Status')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled Maintenance')).not.toBeInTheDocument();
    expect(screen.getByText('Past Incidents')).toBeInTheDocument();
  });

  it('handles data with systems field instead of items', () => {
    const dataWithSystems: StatusData = {
      items: [],
      systems: sampleStatusData.items,
      incidents: [],
      maintenance: [],
      lastUpdated: '2025-11-04T12:00:00Z',
      overallStatus: 'operational',
    };
    
    render(<UptimeStatusPage statusData={dataWithSystems} />);
    
    expect(screen.getByText('API Service')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
  });
});
