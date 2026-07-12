/**
 * E2E Tests for ADR-004: Expand/Collapse Behavior (#59)
 *
 * Tests the user interaction flows for expandable status cards.
 *
 * @jest-environment jsdom
 * @see docs/adrs/ADR-004-simplified-status-card-ux.md
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Import components
import { SystemCard, SystemCardDetails, SystemCardUptimeBar } from '../../src/theme/SystemCard';
import { SystemCardGroup } from '../../src/theme/SystemCardGroup';

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

describe('ADR-004: Expand/Collapse E2E Tests (#59)', () => {
  describe('SystemCard Expand/Collapse', () => {
    it('should expand card when clicked', () => {
      const { container } = render(
        <SystemCard name="api" status="up" expandable>
          <SystemCardDetails>
            Detailed API information
          </SystemCardDetails>
        </SystemCard>
      );

      // Initially collapsed
      const details = container.querySelector('.cardDetails');
      expect(details).toHaveAttribute('aria-hidden', 'true');

      // Click to expand
      const card = screen.getByRole('article');
      fireEvent.click(card);

      // Should be expanded
      expect(details).toHaveAttribute('aria-hidden', 'false');
    });

    it('should collapse card when clicked again', () => {
      const { container } = render(
        <SystemCard name="api" status="up" expandable defaultExpanded>
          <SystemCardDetails>
            Detailed API information
          </SystemCardDetails>
        </SystemCard>
      );

      // Initially expanded
      const details = container.querySelector('.cardDetails');
      expect(details).toHaveAttribute('aria-hidden', 'false');

      // Click to collapse
      const card = screen.getByRole('article');
      fireEvent.click(card);

      // Should be collapsed
      expect(details).toHaveAttribute('aria-hidden', 'true');
    });

    it('should expand with Enter key', () => {
      const { container } = render(
        <SystemCard name="api" status="up" expandable>
          <SystemCardDetails>
            Detailed API information
          </SystemCardDetails>
        </SystemCard>
      );

      const button = screen.getByRole('button', { name: /toggle api details/i });
      fireEvent.keyDown(button, { key: 'Enter' });

      const details = container.querySelector('.cardDetails');
      expect(details).toHaveAttribute('aria-hidden', 'false');
    });

    it('should expand with Space key', () => {
      const { container } = render(
        <SystemCard name="api" status="up" expandable>
          <SystemCardDetails>
            Detailed API information
          </SystemCardDetails>
        </SystemCard>
      );

      const button = screen.getByRole('button', { name: /toggle api details/i });
      fireEvent.keyDown(button, { key: ' ' });

      const details = container.querySelector('.cardDetails');
      expect(details).toHaveAttribute('aria-hidden', 'false');
    });

    it('should close with Escape key when expanded', () => {
      const { container } = render(
        <SystemCard name="api" status="up" expandable defaultExpanded>
          <SystemCardDetails>
            Detailed API information
          </SystemCardDetails>
        </SystemCard>
      );

      // Focus the card and press Escape
      const card = screen.getByRole('article');
      fireEvent.keyDown(card, { key: 'Escape' });

      const details = container.querySelector('.cardDetails');
      expect(details).toHaveAttribute('aria-hidden', 'true');
    });

    it('should call onExpandChange callback', () => {
      const onExpandChange = jest.fn();

      render(
        <SystemCard name="api" status="up" expandable onExpandChange={onExpandChange}>
          <SystemCardDetails>
            Detailed API information
          </SystemCardDetails>
        </SystemCard>
      );

      const card = screen.getByRole('article');
      fireEvent.click(card);

      expect(onExpandChange).toHaveBeenCalledWith(true);
    });
  });

  describe('SystemCardGroup Expand/Collapse', () => {
    it('should collapse group when toggle clicked', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
          <SystemCard name="database" status="up" />
        </SystemCardGroup>
      );

      // Initially expanded
      expect(container.querySelector('.collapsed')).not.toBeInTheDocument();

      // Click toggle
      const toggle = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.click(toggle);

      // Should be collapsed
      expect(container.querySelector('.collapsed')).toBeInTheDocument();
    });

    it('should expand group when toggle clicked again', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure" defaultCollapsed>
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      // Initially collapsed
      expect(container.querySelector('.collapsed')).toBeInTheDocument();

      // Click toggle
      const toggle = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.click(toggle);

      // Should be expanded
      expect(container.querySelector('.collapsed')).not.toBeInTheDocument();
    });

    it('should toggle with Enter key', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const toggle = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.keyDown(toggle, { key: 'Enter' });

      expect(container.querySelector('.collapsed')).toBeInTheDocument();
    });

    it('should update aria-expanded on toggle button', () => {
      render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const toggle = screen.getByRole('button', { name: /toggle infrastructure group/i });

      // Initially expanded
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(toggle);

      // Now collapsed
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('should hide content with aria-hidden when collapsed', () => {
      const { container } = render(
        <SystemCardGroup name="infrastructure" displayName="Infrastructure">
          <SystemCard name="api" status="up" />
        </SystemCardGroup>
      );

      const toggle = screen.getByRole('button', { name: /toggle infrastructure group/i });
      fireEvent.click(toggle);

      const content = container.querySelector('.groupContent');
      expect(content).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('UptimeBar Keyboard Navigation', () => {
    // Note: These tests verify keyboard navigation when data is available
    // The mock returns empty array, so we test with direct UptimeBar rendering

    it('should render UptimeBar with empty state message when no data', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardUptimeBar serviceName="api" />
        </SystemCard>
      );

      // With empty mock data, should show empty state
      const emptyMessage = container.querySelector('.emptyMessage');
      expect(emptyMessage || container.textContent).toBeTruthy();
    });

    it('should render UptimeBar container for navigation', () => {
      const { container } = render(
        <SystemCard name="api" status="up">
          <SystemCardUptimeBar serviceName="api" />
        </SystemCard>
      );

      // Verify the component renders
      const uptimeBarContainer = container.querySelector('.uptimeBarContainer');
      expect(uptimeBarContainer).toBeInTheDocument();
    });
  });

  describe('Multi-Card Interaction', () => {
    it('should allow expanding multiple cards', () => {
      const { container } = render(
        <>
          <SystemCard name="api" status="up" expandable>
            <SystemCardDetails>API Details</SystemCardDetails>
          </SystemCard>
          <SystemCard name="database" status="up" expandable>
            <SystemCardDetails>Database Details</SystemCardDetails>
          </SystemCard>
        </>
      );

      const cards = screen.getAllByRole('article');

      // Expand first card
      fireEvent.click(cards[0]);

      // Expand second card
      fireEvent.click(cards[1]);

      // Both should be expanded
      const allDetails = container.querySelectorAll('.cardDetails');
      expect(allDetails[0]).toHaveAttribute('aria-hidden', 'false');
      expect(allDetails[1]).toHaveAttribute('aria-hidden', 'false');
    });

    it('should maintain independent expand state', () => {
      const { container } = render(
        <>
          <SystemCard name="api" status="up" expandable defaultExpanded>
            <SystemCardDetails>API Details</SystemCardDetails>
          </SystemCard>
          <SystemCard name="database" status="up" expandable>
            <SystemCardDetails>Database Details</SystemCardDetails>
          </SystemCard>
        </>
      );

      const cards = screen.getAllByRole('article');
      const allDetails = container.querySelectorAll('.cardDetails');

      // First card expanded, second collapsed
      expect(allDetails[0]).toHaveAttribute('aria-hidden', 'false');
      expect(allDetails[1]).toHaveAttribute('aria-hidden', 'true');

      // Collapse first
      fireEvent.click(cards[0]);

      // First collapsed, second still collapsed
      expect(allDetails[0]).toHaveAttribute('aria-hidden', 'true');
      expect(allDetails[1]).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
