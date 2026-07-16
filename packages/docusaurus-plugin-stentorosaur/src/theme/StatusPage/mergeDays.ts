/**
 * Merge the 90-day daily rollup series into a per-entity check history
 * so long-range charts (Uptime Overview 30d/90d, SLI/SLO, error budget)
 * can fill their full window from the daily aggregate — issue #114.
 *
 * The entity-detail `readings` file is only a short rolling window
 * (~13-30 days), so a 90-day view built from it alone shows mostly
 * empty columns. The 90-day daily series lives in `summary.json`
 * (per-entity `days` rollups) and already backs the `/status` heatmap
 * (StatusItem). This is the single shared merge both views use:
 * high-resolution readings win for recent days, daily rollups fill the
 * older days.
 */

import type {DayRollup} from '@stentorosaur/core';
import type {StatusCheckHistory} from '../../types';

/**
 * Combine `existingHistory` (sub-daily readings) with `days` (daily
 * rollups). Recent days keep their high-resolution readings; any day
 * NOT already present in `existingHistory` is filled with one
 * representative daily check. Result is sorted newest-first (what the
 * charts and heatmap expect). `daysToShow` clamps the rollups to the
 * most recent N days.
 */
export function mergeDaysIntoHistory(
  existingHistory: StatusCheckHistory[],
  days: DayRollup[],
  daysToShow: number
): StatusCheckHistory[] {
  const recent = days.slice(-daysToShow);
  if (recent.length === 0) {
    return existingHistory;
  }

  // Each rollup day becomes a single representative "check" at midday.
  const summaryAsHistory: StatusCheckHistory[] = recent.map(day => ({
    timestamp: `${day.date}T12:00:00Z`,
    status: day.worst,
    code: day.uptime > 0 ? 200 : 500,
    responseTime: day.avgMs || 0,
  }));

  // Prefer existing (high-resolution) history for days it already
  // covers; only add rollup days that are missing.
  const existingDates = new Set(existingHistory.map(h => h.timestamp.split('T')[0]));
  const combined = [...existingHistory];
  for (const entry of summaryAsHistory) {
    const dateKey = entry.timestamp.split('T')[0];
    if (!existingDates.has(dateKey)) {
      combined.push(entry);
    }
  }

  return combined.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
