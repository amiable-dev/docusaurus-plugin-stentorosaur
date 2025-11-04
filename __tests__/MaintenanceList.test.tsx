/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MaintenanceList from '../src/theme/Maintenance/MaintenanceList';
import type { ScheduledMaintenance } from '../src/types';

describe('MaintenanceList', () => {
  const sampleMaintenance: ScheduledMaintenance[] = [
    {
      id: 1,
      title: 'Future Maintenance',
      start: '2025-12-01T02:00:00Z',
      end: '2025-12-01T04:00:00Z',
      status: 'upcoming',
      affectedSystems: ['API'],
      description: 'Future work',
      comments: [],
      url: 'https://github.com/example/repo/issues/1',
      createdAt: '2025-11-01T10:00:00Z',
    },
    {
      id: 2,
      title: 'Current Maintenance',
      start: '2025-11-04T01:00:00Z',
      end: '2025-11-04T23:00:00Z',
      status: 'in-progress',
      affectedSystems: ['Database'],
      description: 'Ongoing work',
      comments: [],
      url: 'https://github.com/example/repo/issues/2',
      createdAt: '2025-11-03T10:00:00Z',
    },
    {
      id: 3,
      title: 'Past Maintenance',
      start: '2025-10-01T02:00:00Z',
      end: '2025-10-01T04:00:00Z',
      status: 'completed',
      affectedSystems: ['CDN'],
      description: 'Completed work',
      comments: [],
      url: 'https://github.com/example/repo/issues/3',
      createdAt: '2025-09-28T10:00:00Z',
    },
  ];

  it('renders all maintenance items when filterStatus is "all"', () => {
    render(<MaintenanceList maintenance={sampleMaintenance} filterStatus="all" />);
    
    expect(screen.getByText('Future Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Current Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Past Maintenance')).toBeInTheDocument();
  });

  it('filters by upcoming status', () => {
    render(<MaintenanceList maintenance={sampleMaintenance} filterStatus="upcoming" />);
    
    expect(screen.getByText('Future Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Current Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('Past Maintenance')).not.toBeInTheDocument();
  });

  it('filters by in-progress status', () => {
    render(<MaintenanceList maintenance={sampleMaintenance} filterStatus="in-progress" />);
    
    expect(screen.queryByText('Future Maintenance')).not.toBeInTheDocument();
    expect(screen.getByText('Current Maintenance')).toBeInTheDocument();
    expect(screen.queryByText('Past Maintenance')).not.toBeInTheDocument();
  });

  it('filters by completed status', () => {
    render(<MaintenanceList maintenance={sampleMaintenance} filterStatus="completed" />);
    
    expect(screen.queryByText('Future Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('Current Maintenance')).not.toBeInTheDocument();
    expect(screen.getByText('Past Maintenance')).toBeInTheDocument();
  });

  it('displays empty state when no maintenance items match filter', () => {
    const upcomingOnly: ScheduledMaintenance[] = [sampleMaintenance[0]];
    
    render(
      <MaintenanceList 
        maintenance={upcomingOnly} 
        filterStatus="completed" 
        emptyMessage="No completed maintenance"
      />
    );
    
    expect(screen.getByText('No completed maintenance')).toBeInTheDocument();
  });

  it('displays default empty message when maintenance array is empty', () => {
    render(<MaintenanceList maintenance={[]} />);
    
    expect(screen.getByText('No scheduled maintenance')).toBeInTheDocument();
  });

  it('displays custom empty message', () => {
    render(
      <MaintenanceList 
        maintenance={[]} 
        emptyMessage="Custom empty message"
      />
    );
    
    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('passes showComments prop to MaintenanceItem', () => {
    const maintenanceWithComments: ScheduledMaintenance[] = [
      {
        ...sampleMaintenance[0],
        comments: [
          {
            author: 'admin',
            timestamp: '2025-11-01T10:00:00Z',
            body: 'Test comment',
          },
        ],
      },
    ];
    
    render(<MaintenanceList maintenance={maintenanceWithComments} showComments={true} />);
    
    // Should show comment count when showComments is true
    expect(screen.getByText(/1 update/)).toBeInTheDocument();
  });

  it('hides comments when showComments is false', () => {
    const maintenanceWithComments: ScheduledMaintenance[] = [
      {
        ...sampleMaintenance[0],
        comments: [
          {
            author: 'admin',
            timestamp: '2025-11-01T10:00:00Z',
            body: 'Test comment',
          },
        ],
      },
    ];
    
    render(<MaintenanceList maintenance={maintenanceWithComments} showComments={false} />);
    
    // Should not show comment count when showComments is false
    expect(screen.queryByText(/update/)).not.toBeInTheDocument();
  });

  it('sorts upcoming maintenance by start time (soonest first)', () => {
    const unsortedUpcoming: ScheduledMaintenance[] = [
      {
        id: 2,
        title: 'Later Maintenance',
        start: '2025-12-15T02:00:00Z',
        end: '2025-12-15T04:00:00Z',
        status: 'upcoming',
        affectedSystems: [],
        description: '',
        comments: [],
        url: 'https://example.com/2',
        createdAt: '2025-11-01T10:00:00Z',
      },
      {
        id: 1,
        title: 'Sooner Maintenance',
        start: '2025-12-10T02:00:00Z',
        end: '2025-12-10T04:00:00Z',
        status: 'upcoming',
        affectedSystems: [],
        description: '',
        comments: [],
        url: 'https://example.com/1',
        createdAt: '2025-11-01T10:00:00Z',
      },
    ];
    
    const { container } = render(<MaintenanceList maintenance={unsortedUpcoming} />);
    const titles = container.querySelectorAll('h3');
    
    expect(titles[0].textContent).toContain('Sooner Maintenance');
    expect(titles[1].textContent).toContain('Later Maintenance');
  });

  it('sorts completed maintenance by start time (most recent first)', () => {
    const unsortedCompleted: ScheduledMaintenance[] = [
      {
        id: 1,
        title: 'Older Maintenance',
        start: '2025-10-01T02:00:00Z',
        end: '2025-10-01T04:00:00Z',
        status: 'completed',
        affectedSystems: [],
        description: '',
        comments: [],
        url: 'https://example.com/1',
        createdAt: '2025-09-28T10:00:00Z',
      },
      {
        id: 2,
        title: 'Newer Maintenance',
        start: '2025-10-15T02:00:00Z',
        end: '2025-10-15T04:00:00Z',
        status: 'completed',
        affectedSystems: [],
        description: '',
        comments: [],
        url: 'https://example.com/2',
        createdAt: '2025-10-12T10:00:00Z',
      },
    ];
    
    const { container } = render(<MaintenanceList maintenance={unsortedCompleted} />);
    const titles = container.querySelectorAll('h3');
    
    expect(titles[0].textContent).toContain('Newer Maintenance');
    expect(titles[1].textContent).toContain('Older Maintenance');
  });
});
