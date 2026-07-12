/**
 * TDD Tests for ADR-004: StatusBadge Component (#52)
 *
 * Status indicator badge with status text and icon.
 * Supports i18n via customizable labels and size variants.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// Import component (will fail until implemented)
import { StatusBadge } from '../../src/theme/StatusBadge';

describe('ADR-004: StatusBadge Component (#52)', () => {
  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(<StatusBadge status="up" />);
      expect(screen.getByText('Operational')).toBeInTheDocument();
    });

    it('should display correct default labels for each status', () => {
      const { rerender } = render(<StatusBadge status="up" />);
      expect(screen.getByText('Operational')).toBeInTheDocument();

      rerender(<StatusBadge status="degraded" />);
      expect(screen.getByText('Degraded')).toBeInTheDocument();

      rerender(<StatusBadge status="down" />);
      expect(screen.getByText('Major Outage')).toBeInTheDocument();

      rerender(<StatusBadge status="maintenance" />);
      expect(screen.getByText('Maintenance')).toBeInTheDocument();
    });

    it('should apply correct CSS class for each status', () => {
      const { rerender, container } = render(<StatusBadge status="up" />);
      expect(container.querySelector('.statusUp')).toBeInTheDocument();

      rerender(<StatusBadge status="degraded" />);
      expect(container.querySelector('.statusDegraded')).toBeInTheDocument();

      rerender(<StatusBadge status="down" />);
      expect(container.querySelector('.statusDown')).toBeInTheDocument();

      rerender(<StatusBadge status="maintenance" />);
      expect(container.querySelector('.statusMaintenance')).toBeInTheDocument();
    });
  });

  describe('Custom Labels (i18n)', () => {
    it('should use custom labels when provided', () => {
      render(
        <StatusBadge
          status="up"
          labels={{
            up: 'Disponible',
            degraded: 'Degradado',
            down: 'Interrupci\u00f3n',
            maintenance: 'Mantenimiento',
          }}
        />
      );
      expect(screen.getByText('Disponible')).toBeInTheDocument();
    });

    it('should allow partial label overrides', () => {
      render(
        <StatusBadge
          status="degraded"
          labels={{
            degraded: 'Partially Working',
          }}
        />
      );
      expect(screen.getByText('Partially Working')).toBeInTheDocument();
    });

    it('should fallback to default for missing custom labels', () => {
      render(
        <StatusBadge
          status="down"
          labels={{
            up: 'Custom Up',
            // down not specified, should use default
          }}
        />
      );
      expect(screen.getByText('Major Outage')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should apply small size class', () => {
      const { container } = render(<StatusBadge status="up" size="sm" />);
      expect(container.querySelector('.sizeSm')).toBeInTheDocument();
    });

    it('should apply medium size class (default)', () => {
      const { container } = render(<StatusBadge status="up" />);
      expect(container.querySelector('.sizeMd')).toBeInTheDocument();
    });

    it('should apply large size class', () => {
      const { container } = render(<StatusBadge status="up" size="lg" />);
      expect(container.querySelector('.sizeLg')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should include status icon for color independence', () => {
      const { container } = render(<StatusBadge status="up" />);
      const icon = container.querySelector('.statusIcon');
      expect(icon).toBeInTheDocument();
    });

    it('should have accessible status dot with aria-hidden', () => {
      const { container } = render(<StatusBadge status="up" />);
      const icon = container.querySelector('.statusIcon');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have role="status" for screen reader announcements', () => {
      const { container } = render(<StatusBadge status="up" />);
      expect(container.querySelector('[role="status"]')).toBeInTheDocument();
    });

    it('should include visually hidden text for screen readers', () => {
      render(<StatusBadge status="down" />);
      // The "Major Outage" text should be readable by screen readers
      expect(screen.getByText('Major Outage')).toBeInTheDocument();
    });
  });

  describe('Status Icon', () => {
    it('should show checkmark for operational status', () => {
      const { container } = render(<StatusBadge status="up" />);
      const icon = container.querySelector('.statusIcon');
      // The icon content should indicate success
      expect(icon?.textContent).toMatch(/[✓●]/);
    });

    it('should show warning for degraded status', () => {
      const { container } = render(<StatusBadge status="degraded" />);
      const icon = container.querySelector('.statusIcon');
      expect(icon?.textContent).toMatch(/[⚠▲●]/);
    });

    it('should show error for down status', () => {
      const { container } = render(<StatusBadge status="down" />);
      const icon = container.querySelector('.statusIcon');
      expect(icon?.textContent).toMatch(/[✕×●]/);
    });

    it('should show maintenance icon for maintenance status', () => {
      const { container } = render(<StatusBadge status="maintenance" />);
      const icon = container.querySelector('.statusIcon');
      expect(icon?.textContent).toMatch(/[🔧⚙●]/);
    });
  });

  describe('CSS Variables', () => {
    it('should use correct color variable for operational', () => {
      const { container } = render(<StatusBadge status="up" />);
      const badge = container.querySelector('.statusBadge');
      expect(badge).toHaveClass('statusUp');
    });

    it('should use correct color variable for degraded', () => {
      const { container } = render(<StatusBadge status="degraded" />);
      const badge = container.querySelector('.statusBadge');
      expect(badge).toHaveClass('statusDegraded');
    });

    it('should use correct color variable for down', () => {
      const { container } = render(<StatusBadge status="down" />);
      const badge = container.querySelector('.statusBadge');
      expect(badge).toHaveClass('statusDown');
    });

    it('should use correct color variable for maintenance', () => {
      const { container } = render(<StatusBadge status="maintenance" />);
      const badge = container.querySelector('.statusBadge');
      expect(badge).toHaveClass('statusMaintenance');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty labels object', () => {
      render(<StatusBadge status="up" labels={{}} />);
      expect(screen.getByText('Operational')).toBeInTheDocument();
    });

    it('should handle undefined labels', () => {
      render(<StatusBadge status="down" labels={undefined} />);
      expect(screen.getByText('Major Outage')).toBeInTheDocument();
    });
  });
});
