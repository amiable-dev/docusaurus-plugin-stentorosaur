/**
 * TDD Tests for ADR-004: UptimeBar Component (#51)
 *
 * 90-day horizontal uptime bar visualization.
 * Displays daily uptime status as colored cells.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { DayStatus } from '../../src/context/StatusDataProvider';

// Import component (will fail until implemented)
import { UptimeBar } from '../../src/theme/UptimeBar';
import {
  StatusDataProvider,
  StatusDataContextValue,
} from '../../src/context/StatusDataProvider';

// Mock StatusDataProvider context
const mockGetMerged90Days = jest.fn();
const mockRefresh = jest.fn();

jest.mock('../../src/context/StatusDataProvider', () => {
  const actual = jest.requireActual('../../src/context/StatusDataProvider');
  return {
    ...actual,
    useStatusData: () => ({
      dailySummary: null,
      currentStatus: null,
      loading: false,
      error: null,
      getMerged90Days: mockGetMerged90Days,
      refresh: mockRefresh,
    }),
  };
});

// Helper to generate mock day data
function generateMockDays(
  count: number,
  status: DayStatus['status'] = 'operational'
): DayStatus[] {
  const days: DayStatus[] = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push({
      date: date.toISOString().split('T')[0],
      uptimePercent: status === 'operational' ? 100 : status === 'degraded' ? 97 : 80,
      incidents: status === 'outage' ? 2 : 0,
      checksTotal: 144,
      checksPassed: status === 'operational' ? 144 : status === 'degraded' ? 140 : 115,
      status,
    });
  }

  return days;
}

describe('ADR-004: UptimeBar Component (#51)', () => {
  beforeEach(() => {
    mockGetMerged90Days.mockReset();
    mockGetMerged90Days.mockReturnValue(generateMockDays(90));
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<UptimeBar serviceName="api" />);
      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('should render correct number of day cells', () => {
      const { container } = render(<UptimeBar serviceName="api" />);
      const cells = container.querySelectorAll('.dayCell');
      expect(cells.length).toBe(90);
    });

    it('should render 30 days when days prop is 30', () => {
      const { container } = render(<UptimeBar serviceName="api" days={30} />);
      const cells = container.querySelectorAll('.dayCell');
      expect(cells.length).toBe(30);
    });

    it('should render 60 days when days prop is 60', () => {
      const { container } = render(<UptimeBar serviceName="api" days={60} />);
      const cells = container.querySelectorAll('.dayCell');
      expect(cells.length).toBe(60);
    });

    it('should fetch data for the correct service', () => {
      render(<UptimeBar serviceName="api" />);
      expect(mockGetMerged90Days).toHaveBeenCalledWith('api');
    });
  });

  describe('Data Override', () => {
    it('should use provided data instead of context when data prop is set', () => {
      const customData = generateMockDays(10, 'degraded');
      const { container } = render(
        <UptimeBar serviceName="api" data={customData} days={10} />
      );

      // Should not call context when data is provided
      expect(mockGetMerged90Days).not.toHaveBeenCalled();

      const cells = container.querySelectorAll('.dayCell');
      expect(cells.length).toBe(10);
    });
  });

  describe('Status Colors', () => {
    it('should apply operational class for 100% uptime days', () => {
      const data = generateMockDays(5, 'operational');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} />
      );

      const cells = container.querySelectorAll('.dayCell');
      cells.forEach((cell) => {
        expect(cell).toHaveClass('statusOperational');
      });
    });

    it('should apply degraded class for degraded days', () => {
      const data = generateMockDays(5, 'degraded');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} />
      );

      const cells = container.querySelectorAll('.dayCell');
      cells.forEach((cell) => {
        expect(cell).toHaveClass('statusDegraded');
      });
    });

    it('should apply outage class for outage days', () => {
      const data = generateMockDays(5, 'outage');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} />
      );

      const cells = container.querySelectorAll('.dayCell');
      cells.forEach((cell) => {
        expect(cell).toHaveClass('statusOutage');
      });
    });

    it('should apply no-data class for days without data', () => {
      const data = generateMockDays(5, 'no-data');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} />
      );

      const cells = container.querySelectorAll('.dayCell');
      cells.forEach((cell) => {
        expect(cell).toHaveClass('statusNoData');
      });
    });
  });

  describe('Uptime Percentage Display', () => {
    it('should show uptime percentage by default', () => {
      const data = generateMockDays(90, 'operational');
      render(<UptimeBar serviceName="api" data={data} />);

      // Should show 100% or similar
      expect(screen.getByText(/\d+(\.\d+)?%/)).toBeInTheDocument();
    });

    it('should hide uptime percentage when showPercentage is false', () => {
      const data = generateMockDays(90, 'operational');
      render(<UptimeBar serviceName="api" data={data} showPercentage={false} />);

      // Should not show percentage text
      expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    });

    it('should calculate correct average uptime percentage', () => {
      // Mix of statuses
      const data: DayStatus[] = [
        {
          date: '2026-01-04',
          uptimePercent: 100,
          incidents: 0,
          checksTotal: 144,
          checksPassed: 144,
          status: 'operational',
        },
        {
          date: '2026-01-03',
          uptimePercent: 90,
          incidents: 1,
          checksTotal: 144,
          checksPassed: 130,
          status: 'outage',
        },
      ];

      render(<UptimeBar serviceName="api" data={data} days={2} />);

      // Average should be 95%
      expect(screen.getByText('95.00%')).toBeInTheDocument();
    });
  });

  describe('Date Labels', () => {
    it('should show date labels by default', () => {
      const data = generateMockDays(90, 'operational');
      render(<UptimeBar serviceName="api" data={data} />);

      expect(screen.getByText('90 days ago')).toBeInTheDocument();
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    it('should hide date labels when showDateLabels is false', () => {
      const data = generateMockDays(90, 'operational');
      render(
        <UptimeBar serviceName="api" data={data} showDateLabels={false} />
      );

      expect(screen.queryByText('90 days ago')).not.toBeInTheDocument();
      expect(screen.queryByText('Today')).not.toBeInTheDocument();
    });
  });

  describe('Custom Thresholds', () => {
    it('should use default thresholds (99% operational, 95% degraded)', () => {
      const data: DayStatus[] = [
        {
          date: '2026-01-04',
          uptimePercent: 99.5,
          incidents: 0,
          checksTotal: 144,
          checksPassed: 143,
          status: 'operational',
        },
      ];

      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={1} />
      );

      const cell = container.querySelector('.dayCell');
      expect(cell).toHaveClass('statusOperational');
    });

    it('should apply custom thresholds when provided', () => {
      const data: DayStatus[] = [
        {
          date: '2026-01-04',
          uptimePercent: 99.5,
          incidents: 0,
          checksTotal: 144,
          checksPassed: 143,
          status: 'operational', // Original status
        },
      ];

      const { container } = render(
        <UptimeBar
          serviceName="api"
          data={data}
          days={1}
          thresholds={{ operational: 99.9, degraded: 99 }}
        />
      );

      // With custom threshold of 99.9%, 99.5% should be degraded
      const cell = container.querySelector('.dayCell');
      expect(cell).toHaveClass('statusDegraded');
    });
  });

  describe('Loading State', () => {
    it('should show loading skeleton when loading is true', () => {
      const { container } = render(<UptimeBar serviceName="api" loading={true} />);

      expect(container.querySelector('.loading')).toBeInTheDocument();
    });

    it('should not render day cells when loading', () => {
      const { container } = render(<UptimeBar serviceName="api" loading={true} />);

      const cells = container.querySelectorAll('.dayCell');
      expect(cells.length).toBe(0);
    });
  });

  describe('Error State', () => {
    it('should show error message when error is provided', () => {
      render(
        <UptimeBar serviceName="api" error={new Error('Failed to load')} />
      );

      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });

    it('should show retry button when onRetry is provided', () => {
      const onRetry = jest.fn();
      render(
        <UptimeBar
          serviceName="api"
          error={new Error('Network error')}
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', () => {
      const onRetry = jest.fn();
      render(
        <UptimeBar
          serviceName="api"
          error={new Error('Network error')}
          onRetry={onRetry}
        />
      );

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('should have role="group" for the container', () => {
      const data = generateMockDays(90, 'operational');
      render(<UptimeBar serviceName="api" data={data} />);

      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('should have aria-label describing the uptime', () => {
      const data = generateMockDays(90, 'operational');
      render(<UptimeBar serviceName="api" data={data} />);

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute('aria-label');
      expect(container.getAttribute('aria-label')).toMatch(/uptime/i);
    });

    it('should allow custom aria-label', () => {
      const data = generateMockDays(90, 'operational');
      render(
        <UptimeBar
          serviceName="api"
          data={data}
          ariaLabel="Custom API uptime description"
        />
      );

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute(
        'aria-label',
        'Custom API uptime description'
      );
    });

    it('should implement roving tabindex (only first cell focusable initially)', () => {
      const data = generateMockDays(5, 'operational');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} />
      );

      const cells = container.querySelectorAll('.dayCell');
      // First cell should have tabindex="0" (focusable)
      expect(cells[0]).toHaveAttribute('tabindex', '0');
      // Other cells should have tabindex="-1" (not in tab order but focusable via arrows)
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i]).toHaveAttribute('tabindex', '-1');
      }
    });

    it('should have aria-label on each day cell', () => {
      const data = generateMockDays(1, 'operational');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={1} />
      );

      const cell = container.querySelector('.dayCell');
      expect(cell).toHaveAttribute('aria-label');
      expect(cell?.getAttribute('aria-label')).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should navigate with arrow keys (roving tabindex)', () => {
      const data = generateMockDays(5, 'operational');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} />
      );

      const cells = container.querySelectorAll('.dayCell');
      const group = screen.getByRole('group');

      // Focus first cell
      fireEvent.focus(cells[0]);

      // Press ArrowRight to move to second cell
      fireEvent.keyDown(group, { key: 'ArrowRight' });

      // Second cell should now have tabindex="0"
      expect(cells[1]).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Interactions', () => {
    it('should call onDayClick when a day is clicked', () => {
      const onDayClick = jest.fn();
      const data = generateMockDays(5, 'operational');

      const { container } = render(
        <UptimeBar
          serviceName="api"
          data={data}
          days={5}
          onDayClick={onDayClick}
        />
      );

      const firstCell = container.querySelector('.dayCell');
      if (firstCell) {
        fireEvent.click(firstCell);
      }

      expect(onDayClick).toHaveBeenCalledTimes(1);
      expect(onDayClick).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          date: expect.any(String),
          uptimePercent: expect.any(Number),
          status: 'operational',
        })
      );
    });

    it('should call onDayHover with data when hovering over a day', () => {
      const onDayHover = jest.fn();
      const data = generateMockDays(5, 'operational');

      const { container } = render(
        <UptimeBar
          serviceName="api"
          data={data}
          days={5}
          onDayHover={onDayHover}
        />
      );

      const firstCell = container.querySelector('.dayCell');
      if (firstCell) {
        fireEvent.mouseEnter(firstCell);
      }

      expect(onDayHover).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          date: expect.any(String),
          status: 'operational',
        })
      );
    });

    it('should call onDayHover with null when mouse leaves', () => {
      const onDayHover = jest.fn();
      const data = generateMockDays(5, 'operational');

      const { container } = render(
        <UptimeBar
          serviceName="api"
          data={data}
          days={5}
          onDayHover={onDayHover}
        />
      );

      const firstCell = container.querySelector('.dayCell');
      if (firstCell) {
        fireEvent.mouseEnter(firstCell);
        fireEvent.mouseLeave(firstCell);
      }

      expect(onDayHover).toHaveBeenLastCalledWith(expect.any(String), null);
    });

    it('should handle keyboard Enter to activate day click', () => {
      const onDayClick = jest.fn();
      const data = generateMockDays(5, 'operational');

      const { container } = render(
        <UptimeBar
          serviceName="api"
          data={data}
          days={5}
          onDayClick={onDayClick}
        />
      );

      const firstCell = container.querySelector('.dayCell');
      if (firstCell) {
        fireEvent.keyDown(firstCell, { key: 'Enter' });
      }

      expect(onDayClick).toHaveBeenCalledTimes(1);
    });

    it('should handle keyboard Space to activate day click', () => {
      const onDayClick = jest.fn();
      const data = generateMockDays(5, 'operational');

      const { container } = render(
        <UptimeBar
          serviceName="api"
          data={data}
          days={5}
          onDayClick={onDayClick}
        />
      );

      const firstCell = container.querySelector('.dayCell');
      if (firstCell) {
        fireEvent.keyDown(firstCell, { key: ' ' });
      }

      expect(onDayClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Styling Props', () => {
    it('should apply custom height', () => {
      const data = generateMockDays(5, 'operational');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} height={48} />
      );

      const bar = container.querySelector('.uptimeBar');
      expect(bar).toHaveStyle({ height: '48px' });
    });

    it('should apply custom gap', () => {
      const data = generateMockDays(5, 'operational');
      const { container } = render(
        <UptimeBar serviceName="api" data={data} days={5} gap={4} />
      );

      const bar = container.querySelector('.uptimeBar');
      expect(bar).toHaveStyle({ gap: '4px' });
    });
  });

  describe('Empty State', () => {
    it('should handle empty data gracefully', () => {
      mockGetMerged90Days.mockReturnValue([]);
      const { container } = render(<UptimeBar serviceName="api" />);

      const cells = container.querySelectorAll('.dayCell');
      expect(cells.length).toBe(0);

      // Should show some indicator of no data
      expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });
  });
});
