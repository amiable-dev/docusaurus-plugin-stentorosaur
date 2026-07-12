/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MaintenanceItem from '../src/theme/Maintenance/MaintenanceItem';
import type { ScheduledMaintenance } from '../src/types';

describe('MaintenanceItem', () => {
  const baseMaintenance: ScheduledMaintenance = {
    id: 1,
    title: 'Database Upgrade',
    start: '2025-11-10T02:00:00Z',
    end: '2025-11-10T04:00:00Z',
    status: 'upcoming',
    affectedSystems: ['API Service', 'Database'],
    description: 'Upgrading database to latest version',
    comments: [],
    url: 'https://github.com/example/repo/issues/1',
    createdAt: '2025-11-01T10:00:00Z',
  };

  it('renders maintenance title with link', () => {
    render(<MaintenanceItem maintenance={baseMaintenance} />);
    
    const titleLink = screen.getByRole('link', { name: 'Database Upgrade' });
    expect(titleLink).toBeInTheDocument();
    expect(titleLink).toHaveAttribute('href', 'https://github.com/example/repo/issues/1');
  });

  it('displays upcoming status with correct icon', () => {
    render(<MaintenanceItem maintenance={baseMaintenance} />);
    
    expect(screen.getByText('📅')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('displays in-progress status with correct icon', () => {
    const inProgressMaintenance: ScheduledMaintenance = {
      ...baseMaintenance,
      status: 'in-progress',
    };
    
    render(<MaintenanceItem maintenance={inProgressMaintenance} />);
    
    expect(screen.getByText('🔧')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('displays completed status with correct icon', () => {
    const completedMaintenance: ScheduledMaintenance = {
      ...baseMaintenance,
      status: 'completed',
    };
    
    render(<MaintenanceItem maintenance={completedMaintenance} />);
    
    expect(screen.getByText('✅')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('displays affected systems when showAffectedSystems is true', () => {
    render(<MaintenanceItem maintenance={baseMaintenance} showAffectedSystems={true} />);
    
    expect(screen.getByText(/Affected Systems:/)).toBeInTheDocument();
    expect(screen.getByText(/API Service, Database/)).toBeInTheDocument();
  });

  it('hides affected systems when showAffectedSystems is false', () => {
    render(<MaintenanceItem maintenance={baseMaintenance} showAffectedSystems={false} />);
    
    expect(screen.queryByText(/Affected Systems:/)).not.toBeInTheDocument();
  });

  it('displays description when provided', () => {
    render(<MaintenanceItem maintenance={baseMaintenance} />);
    
    expect(screen.getByText('Upgrading database to latest version')).toBeInTheDocument();
  });

  it('displays comments section when comments exist and showComments is true', () => {
    const maintenanceWithComments: ScheduledMaintenance = {
      ...baseMaintenance,
      comments: [
        {
          author: 'admin',
          timestamp: '2025-11-05T10:00:00Z',
          body: 'Maintenance confirmed',
        },
        {
          author: 'devops',
          timestamp: '2025-11-06T14:00:00Z',
          body: 'Backup completed',
        },
      ],
    };
    
    render(<MaintenanceItem maintenance={maintenanceWithComments} showComments={true} />);
    
    expect(screen.getByText(/2 updates/)).toBeInTheDocument();
  });

  it('expands and collapses comments when toggle button is clicked', () => {
    const maintenanceWithComments: ScheduledMaintenance = {
      ...baseMaintenance,
      comments: [
        {
          author: 'admin',
          timestamp: '2025-11-05T10:00:00Z',
          body: 'Maintenance confirmed',
        },
      ],
    };
    
    render(<MaintenanceItem maintenance={maintenanceWithComments} />);
    
    // Comments should be collapsed initially
    expect(screen.queryByText('Maintenance confirmed')).not.toBeInTheDocument();
    
    // Click toggle button
    const toggleButton = screen.getByRole('button', { name: /1 update/ });
    fireEvent.click(toggleButton);
    
    // Comments should now be visible
    expect(screen.getByText('Maintenance confirmed')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    
    // Click again to collapse
    fireEvent.click(toggleButton);
    expect(screen.queryByText('Maintenance confirmed')).not.toBeInTheDocument();
  });

  it('displays correct singular/plural for comment count', () => {
    const singleComment: ScheduledMaintenance = {
      ...baseMaintenance,
      comments: [
        {
          author: 'admin',
          timestamp: '2025-11-05T10:00:00Z',
          body: 'Test',
        },
      ],
    };
    
    render(<MaintenanceItem maintenance={singleComment} />);
    expect(screen.getByText(/1 update/)).toBeInTheDocument();
    
    const multipleComments: ScheduledMaintenance = {
      ...baseMaintenance,
      comments: [
        { author: 'admin', timestamp: '2025-11-05T10:00:00Z', body: 'Test 1' },
        { author: 'admin', timestamp: '2025-11-05T11:00:00Z', body: 'Test 2' },
      ],
    };
    
    const { rerender } = render(<MaintenanceItem maintenance={multipleComments} />);
    expect(screen.getByText(/2 updates/)).toBeInTheDocument();
  });

  it('hides comments section when showComments is false', () => {
    const maintenanceWithComments: ScheduledMaintenance = {
      ...baseMaintenance,
      comments: [
        {
          author: 'admin',
          timestamp: '2025-11-05T10:00:00Z',
          body: 'Test',
        },
      ],
    };
    
    render(<MaintenanceItem maintenance={maintenanceWithComments} showComments={false} />);
    
    expect(screen.queryByText(/update/)).not.toBeInTheDocument();
  });

  it('handles maintenance with empty affected systems', () => {
    const noSystemsMaintenance: ScheduledMaintenance = {
      ...baseMaintenance,
      affectedSystems: [],
    };
    
    render(<MaintenanceItem maintenance={noSystemsMaintenance} />);
    
    expect(screen.queryByText(/Affected Systems:/)).not.toBeInTheDocument();
  });

  it('displays scheduled time range', () => {
    render(<MaintenanceItem maintenance={baseMaintenance} />);
    
    expect(screen.getByText(/Scheduled:/)).toBeInTheDocument();
  });
});
