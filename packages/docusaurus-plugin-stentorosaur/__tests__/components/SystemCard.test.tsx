/**
 * TDD Tests for ADR-004: SystemCard Compound Component (#53)
 *
 * Collapsible system status card with compound component pattern.
 * Includes Header, UptimeBar, Details, Metrics, and Charts sub-components.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Import component (will fail until implemented)
import {
  SystemCard,
  SystemCardHeader,
  SystemCardUptimeBar,
  SystemCardDetails,
  SystemCardMetrics,
} from '../../src/theme/SystemCard';
import type { DayStatus } from '../../src/context/StatusDataProvider';

// Mock StatusDataProvider context
const mockGetMerged90Days = jest.fn();

jest.mock('../../src/context/StatusDataProvider', () => {
  const actual = jest.requireActual('../../src/context/StatusDataProvider');
  return {
    ...actual,
    useStatusData: () => ({
      // Mock non-null dailySummary to indicate data has loaded
      dailySummary: { version: 1, lastUpdated: new Date().toISOString(), windowDays: 90, services: {} },
      currentStatus: null,
      loading: false,
      error: null,
      getMerged90Days: mockGetMerged90Days,
      refresh: jest.fn(),
    }),
  };
});

// Helper to generate mock day data
function generateMockDays(count: number): DayStatus[] {
  const days: DayStatus[] = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().split('T')[0],
      uptimePercent: 100,
      incidents: 0,
      checksTotal: 144,
      checksPassed: 144,
      status: 'operational',
    });
  }

  return days;
}

describe('ADR-004: SystemCard Component (#53)', () => {
  beforeEach(() => {
    mockGetMerged90Days.mockReset();
    mockGetMerged90Days.mockReturnValue(generateMockDays(90));
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<SystemCard name="api" status="up" />);
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should render with displayName when provided', () => {
      render(<SystemCard name="api" displayName="API Service" status="up" />);
      expect(screen.getByText('API Service')).toBeInTheDocument();
    });

    it('should render with name when displayName is not provided', () => {
      render(<SystemCard name="api" status="up" />);
      expect(screen.getByText('api')).toBeInTheDocument();
    });

    it('should apply the correct status class', () => {
      const { rerender, container } = render(
        <SystemCard name="api" status="up" />
      );
      expect(container.querySelector('.statusUp')).toBeInTheDocument();

      rerender(<SystemCard name="api" status="degraded" />);
      expect(container.querySelector('.statusDegraded')).toBeInTheDocument();

      rerender(<SystemCard name="api" status="down" />);
      expect(container.querySelector('.statusDown')).toBeInTheDocument();

      rerender(<SystemCard name="api" status="maintenance" />);
      expect(container.querySelector('.statusMaintenance')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('should be collapsed by default', () => {
      const { container } = render(<SystemCard name="api" status="up" />);
      expect(container.querySelector('.expanded')).not.toBeInTheDocument();
    });

    it('should expand when clicked', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.click(card);

      expect(container.querySelector('.expanded')).toBeInTheDocument();
    });

    it('should collapse when clicked again', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.click(card);
      fireEvent.click(card);

      expect(container.querySelector('.expanded')).not.toBeInTheDocument();
    });

    it('should start expanded when defaultExpanded is true', () => {
      const { container } = render(
        <SystemCard name="api" status="up" defaultExpanded>
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      expect(container.querySelector('.expanded')).toBeInTheDocument();
    });

    it('should not expand when expandable is false', () => {
      const { container } = render(
        <SystemCard name="api" status="up" expandable={false}>
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.click(card);

      expect(container.querySelector('.expanded')).not.toBeInTheDocument();
    });

    it('should call onExpandChange when expanded', () => {
      const onExpandChange = jest.fn();

      render(
        <SystemCard name="api" status="up" onExpandChange={onExpandChange}>
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.click(card);

      expect(onExpandChange).toHaveBeenCalledWith(true);
    });

    it('should support controlled expanded state', () => {
      const { container, rerender } = render(
        <SystemCard name="api" status="up" expanded={false}>
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      expect(container.querySelector('.expanded')).not.toBeInTheDocument();

      rerender(
        <SystemCard name="api" status="up" expanded={true}>
          <SystemCardDetails>Details content</SystemCardDetails>
        </SystemCard>
      );

      expect(container.querySelector('.expanded')).toBeInTheDocument();
    });
  });

  describe('Compound Components', () => {
    it('should render Header sub-component', () => {
      render(
        <SystemCard name="api" status="up">
          <SystemCardHeader>Custom Header</SystemCardHeader>
        </SystemCard>
      );

      expect(screen.getByText('Custom Header')).toBeInTheDocument();
    });

    it('should render UptimeBar sub-component', () => {
      render(
        <SystemCard name="api" status="up">
          <SystemCardUptimeBar serviceName="api" />
        </SystemCard>
      );

      // UptimeBar should render (changed to role="group" for roving tabindex a11y)
      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('should render Details sub-component only when expanded', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Detailed content here</SystemCardDetails>
        </SystemCard>
      );

      // Details should be hidden initially (aria-hidden="true")
      const details = container.querySelector('.cardDetails');
      expect(details).toHaveAttribute('aria-hidden', 'true');
      expect(details).not.toHaveClass('detailsVisible');

      // Expand the card
      const card = screen.getByRole('article');
      fireEvent.click(card);

      // Now details should be visible
      expect(details).toHaveAttribute('aria-hidden', 'false');
      expect(details).toHaveClass('detailsVisible');
    });

    it('should render Metrics sub-component', () => {
      render(
        <SystemCard name="api" status="up" defaultExpanded>
          <SystemCardDetails>
            <SystemCardMetrics responseTime={145} lastChecked="2 min ago" />
          </SystemCardDetails>
        </SystemCard>
      );

      expect(screen.getByText('145ms')).toBeInTheDocument();
      expect(screen.getByText('2 min ago')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have role="article" for semantic markup', () => {
      render(<SystemCard name="api" status="up" />);
      expect(screen.getByRole('article')).toBeInTheDocument();
    });

    it('should have aria-expanded attribute', () => {
      render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Details</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(card);
      expect(card).toHaveAttribute('aria-expanded', 'true');
    });

    it('should have correct heading level', () => {
      render(<SystemCard name="api" status="up" headingLevel={2} />);
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });

    it('should default to heading level 3', () => {
      render(<SystemCard name="api" status="up" />);
      expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });

    it('should be keyboard accessible with Enter', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Details</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(container.querySelector('.expanded')).toBeInTheDocument();
    });

    it('should be keyboard accessible with Space', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Details</SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.keyDown(card, { key: ' ' });

      expect(container.querySelector('.expanded')).toBeInTheDocument();
    });

    it('should collapse with Escape key', () => {
      const { container } = render(
        <SystemCard name="api" status="up" defaultExpanded>
          <SystemCardDetails>Details</SystemCardDetails>
        </SystemCard>
      );

      expect(container.querySelector('.expanded')).toBeInTheDocument();

      const card = screen.getByRole('article');
      fireEvent.keyDown(card, { key: 'Escape' });

      expect(container.querySelector('.expanded')).not.toBeInTheDocument();
    });

    it('should have custom expandButtonLabel for screen readers', () => {
      render(
        <SystemCard
          name="api"
          status="up"
          expandButtonLabel="Toggle API details"
        >
          <SystemCardDetails>Details</SystemCardDetails>
        </SystemCard>
      );

      expect(
        screen.getByLabelText('Toggle API details')
      ).toBeInTheDocument();
    });
  });

  describe('Status Badge Integration', () => {
    it('should display status badge', () => {
      render(<SystemCard name="api" status="up" />);
      expect(screen.getByText('Operational')).toBeInTheDocument();
    });

    it('should show correct status text for each status', () => {
      const { rerender } = render(<SystemCard name="api" status="up" />);
      expect(screen.getByText('Operational')).toBeInTheDocument();

      rerender(<SystemCard name="api" status="degraded" />);
      expect(screen.getByText('Degraded')).toBeInTheDocument();

      rerender(<SystemCard name="api" status="down" />);
      expect(screen.getByText('Major Outage')).toBeInTheDocument();

      rerender(<SystemCard name="api" status="maintenance" />);
      expect(screen.getByText('Maintenance')).toBeInTheDocument();
    });
  });

  describe('Metrics Component', () => {
    it('should display response time', () => {
      render(
        <SystemCard name="api" status="up" defaultExpanded>
          <SystemCardDetails>
            <SystemCardMetrics responseTime={145} />
          </SystemCardDetails>
        </SystemCard>
      );

      expect(screen.getByText('145ms')).toBeInTheDocument();
    });

    it('should display last checked time', () => {
      render(
        <SystemCard name="api" status="up" defaultExpanded>
          <SystemCardDetails>
            <SystemCardMetrics lastChecked="5 minutes ago" />
          </SystemCardDetails>
        </SystemCard>
      );

      expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    });

    it('should handle undefined values gracefully', () => {
      render(
        <SystemCard name="api" status="up" defaultExpanded>
          <SystemCardDetails>
            <SystemCardMetrics />
          </SystemCardDetails>
        </SystemCard>
      );

      // Should not crash, may show "N/A" or similar
      expect(screen.getByRole('article')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have hover effect class', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardDetails>Details</SystemCardDetails>
        </SystemCard>
      );

      expect(container.querySelector('.systemCard')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <SystemCard name="api" status="up" className="custom-class" />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });
});
