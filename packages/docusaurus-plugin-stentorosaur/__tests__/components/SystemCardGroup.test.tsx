/**
 * TDD Tests for ADR-004: SystemCardGroup Component (#54)
 *
 * Container for grouping multiple SystemCards with collapsible behavior.
 * Shows aggregate status (worst-of) for the group.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Import components (will fail until implemented)
import { SystemCardGroup } from '../../src/theme/SystemCardGroup';
import { SystemCard } from '../../src/theme/SystemCard';

// Mock StatusDataProvider context
jest.mock('../../src/context/StatusDataProvider', () => {
  const actual = jest.requireActual('../../src/context/StatusDataProvider');
  return {
    ...actual,
    useStatusData: () => ({
      dailySummary: null,
      currentStatus: null,
      loading: false,
      error: null,
      getMerged90Days: jest.fn().mockReturnValue([]),
      refresh: jest.fn(),
    }),
  };
});

describe('ADR-004: SystemCardGroup Component (#54)', () => {
  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByText('Infrastructure')).toBeInTheDocument();
    });

    it('should render group heading', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(
        screen.getByRole('heading', { name: 'Infrastructure' })
      ).toBeInTheDocument();
    });

    it('should render child SystemCards', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByText('api')).toBeInTheDocument();
      expect(screen.getByText('web')).toBeInTheDocument();
    });
  });

  describe('Collapse/Expand Behavior', () => {
    it('should be expanded by default', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(container.querySelector('.collapsed')).not.toBeInTheDocument();
    });

    it('should start collapsed when defaultCollapsed is true', () => {
      const { container } = render(
        <SystemCardGroup
          name="infrastructure"
          displayName="Infrastructure"
          defaultCollapsed
        >
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(container.querySelector('.collapsed')).toBeInTheDocument();
    });

    it('should toggle collapse when header is clicked', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      // Get the group toggle button (first button in the group header)
      const toggleButton = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.click(toggleButton);

      expect(container.querySelector('.collapsed')).toBeInTheDocument();
    });

    it('should hide children when collapsed', () => {
      const { container } = render(
        <SystemCardGroup
          name="infrastructure"
          displayName="Infrastructure"
          defaultCollapsed
        >
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const content = container.querySelector('.groupContent');
      expect(content).toHaveAttribute('aria-hidden', 'true');
    });

    it('should show children when expanded', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const content = container.querySelector('.groupContent');
      expect(content).toHaveAttribute('aria-hidden', 'false');
    });
  });

  describe('Status Aggregation', () => {
    it('should show operational when all children are up', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByText('All Operational')).toBeInTheDocument();
    });

    it('should show degraded when any child is degraded', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="degraded" />
        </SystemCardGroup>
      );

      expect(screen.getByText('Partial Issues')).toBeInTheDocument();
    });

    it('should show outage when any child is down', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="down" />
        </SystemCardGroup>
      );

      expect(screen.getByText('Service Outage')).toBeInTheDocument();
    });

    it('should show maintenance when any child is in maintenance', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="maintenance" />
        </SystemCardGroup>
      );

      // Look specifically in the group header for the maintenance status
      const groupHeader = container.querySelector('.groupHeader');
      expect(groupHeader).toHaveTextContent('Maintenance');
    });

    it('should prioritize status correctly: down > maintenance > degraded > up', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="degraded" />
          <SystemCard name="db" status="down" />
        </SystemCardGroup>
      );

      // Down takes priority
      expect(screen.getByText('Service Outage')).toBeInTheDocument();
    });

    it('should allow explicit status override', () => {
      render(
        <SystemCardGroup
          name="infrastructure"
          displayName="Infrastructure"
          status="maintenance"
        >
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      // Override should take precedence
      expect(screen.getByText('Maintenance')).toBeInTheDocument();
    });
  });

  describe('Services Count', () => {
    it('should display count of services', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="web" status="up" />
          <SystemCard name="db" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByText('3 services')).toBeInTheDocument();
    });

    it('should use singular "service" for 1 child', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByText('1 service')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have correct heading level', () => {
      render(
        <SystemCardGroup
          name="infrastructure"
          displayName="Infrastructure"
          headingLevel={2}
        >
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('should default to heading level 2', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('should have aria-expanded on toggle button', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const button = screen.getByRole('button', { name: /toggle infrastructure group/i });
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('should toggle aria-expanded when clicked', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const button = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('should be keyboard accessible', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const button = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.keyDown(button, { key: 'Enter' });

      expect(container.querySelector('.collapsed')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply group container class', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(container.querySelector('.systemCardGroup')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <SystemCardGroup
          name="infrastructure"
          displayName="Infrastructure"
          className="custom-group"
        >
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      expect(container.querySelector('.custom-group')).toBeInTheDocument();
    });

    it('should apply status indicator class', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="down" />
        </SystemCardGroup>
      );

      expect(container.querySelector('.groupStatusDown')).toBeInTheDocument();
    });
  });
});
