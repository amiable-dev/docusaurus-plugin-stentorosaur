/**
 * @jest-environment jsdom
 *
 * PerformanceMetrics modal (#119): its Uptime/SLI charts must fill from
 * the 90-day daily series when the systemFile carries `days`, instead of
 * the 1-point readings buffer. Response Time stays on raw readings.
 */

import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import PerformanceMetrics from '../src/theme/PerformanceMetrics';
import type {SystemStatusFile} from '../src/types';
import type {DayRollup} from '@stentorosaur/core';

const NEWEST = '2026-07-16';

function systemFile(withDays: boolean): SystemStatusFile {
  const days: DayRollup[] = Array.from({length: 90}, (_, i) => ({
    date: new Date(Date.parse(`${NEWEST}T00:00:00Z`) - (89 - i) * 86_400_000).toISOString().split('T')[0],
    uptime: 100,
    avgMs: 40,
    worst: 'up' as const,
  }));
  return {
    name: 'api',
    url: 'https://api.test',
    lastChecked: `${NEWEST}T12:00:00.000Z`,
    currentStatus: 'up',
    // 1-point readings buffer (the bug shape).
    history: [{timestamp: `${NEWEST}T12:00:00.000Z`, status: 'up', code: 200, responseTime: 41}],
    ...(withDays ? {days} : {}),
  };
}

/** Populated (non-"no data") uptime bars in the current view. */
function populatedBars(): number {
  return screen
    .getAllByTestId('uptime-bar')
    .filter(b => !(b.querySelector('title')?.textContent ?? '').includes('no data')).length;
}

describe('PerformanceMetrics (#119)', () => {
  it('fills the modal Uptime chart from the daily series when days are present', () => {
    render(<PerformanceMetrics systemFile={systemFile(true)} isVisible />);
    // Default period is 7d → 7 daily blocks, all filled from the rollups
    // (the 1-point readings buffer alone would fill just today).
    expect(populatedBars()).toBeGreaterThanOrEqual(6);
  });

  it('without a daily series, the modal Uptime shows only the readings buffer', () => {
    render(<PerformanceMetrics systemFile={systemFile(false)} isVisible />);
    expect(populatedBars()).toBeLessThanOrEqual(2);
  });
});
