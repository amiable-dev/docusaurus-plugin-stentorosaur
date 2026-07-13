/**
 * Shared SVG chart primitives (ADR-005 §11; epic #63 ticket #73).
 *
 * Replaces chart.js/react-chartjs-2 for the plugin's status charts:
 * pure SVG, themed via CSS variables (no MutationObserver), accessible
 * (role="img" + aria-label + per-mark <title> tooltips), and rendered
 * identically under SSR/jsdom (no canvas).
 */

import React from 'react';
import styles from './svg.module.css';

const VIEW_W = 800;
const PAD = {top: 12, right: 12, bottom: 24, left: 44};

export interface LinePoint {
  label: string;
  value: number | null;
  /** Optional per-point tone (e.g. status coloring) */
  tone?: 'ok' | 'warn' | 'bad';
  /** Tooltip text; defaults to `${label}: ${value}` */
  title?: string;
}

export interface Threshold {
  value: number;
  label: string;
}

export interface SvgLineChartProps {
  points: LinePoint[];
  height?: number;
  /** Y domain; defaults to data extent padded 10% */
  yMin?: number;
  yMax?: number;
  yFormat?: (v: number) => string;
  thresholds?: Threshold[];
  ariaLabel: string;
  /** Show the filled area under the line */
  area?: boolean;
}

function yScale(v: number, yMin: number, yMax: number, height: number): number {
  const usable = height - PAD.top - PAD.bottom;
  const t = yMax === yMin ? 0.5 : (v - yMin) / (yMax - yMin);
  return PAD.top + usable * (1 - t);
}

function xScale(i: number, count: number): number {
  const usable = VIEW_W - PAD.left - PAD.right;
  return PAD.left + (count <= 1 ? usable / 2 : (usable * i) / (count - 1));
}

export function SvgLineChart({
  points,
  height = 300,
  yMin,
  yMax,
  yFormat = v => String(Math.round(v)),
  thresholds = [],
  ariaLabel,
  area = true,
}: SvgLineChartProps): JSX.Element {
  const values = points.map(p => p.value).filter((v): v is number => v !== null);
  const thresholdValues = thresholds.map(t => t.value);
  const allValues = [...values, ...thresholdValues];
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const span = dataMax === dataMin ? 1 : dataMax - dataMin;
  const lo = yMin ?? dataMin - span * 0.1;
  const hi = yMax ?? dataMax + span * 0.1;

  const coords = points.map((p, i) => ({
    ...p,
    x: xScale(i, points.length),
    y: p.value === null ? null : yScale(p.value, lo, hi, height),
  }));
  const drawn = coords.filter((c): c is typeof c & {y: number} => c.y !== null);
  const linePath = drawn.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const baseline = yScale(lo, lo, hi, height);
  const areaPath = drawn.length > 1
    ? `${linePath} L${drawn[drawn.length - 1].x.toFixed(1)},${baseline.toFixed(1)} L${drawn[0].x.toFixed(1)},${baseline.toFixed(1)} Z`
    : '';

  const ticks = [lo, lo + (hi - lo) / 3, lo + (2 * (hi - lo)) / 3, hi];
  // Sparse x labels: first, middle, last
  const labelIdx = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
      style={{width: '100%', height: 'auto', maxHeight: height}}
    >
      {ticks.map(t => (
        <g key={`tick-${t}`}>
          <line
            className={styles.grid}
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={yScale(t, lo, hi, height)}
            y2={yScale(t, lo, hi, height)}
          />
          <text className={styles.axis} x={PAD.left - 6} y={yScale(t, lo, hi, height) + 4} textAnchor="end">
            {yFormat(t)}
          </text>
        </g>
      ))}
      {thresholds.map(t => (
        <g key={`thr-${t.label}`}>
          <line
            className={styles.threshold}
            data-testid="threshold-line"
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={yScale(t.value, lo, hi, height)}
            y2={yScale(t.value, lo, hi, height)}
          />
          <text className={styles.thresholdLabel} x={VIEW_W - PAD.right} y={yScale(t.value, lo, hi, height) - 4} textAnchor="end">
            {t.label}
          </text>
        </g>
      ))}
      {area && areaPath && <path className={styles.area} d={areaPath} />}
      {linePath && <path className={styles.line} d={linePath} fill="none" />}
      {coords.map((c, i) =>
        c.y === null ? null : (
          <circle
            key={i}
            className={`${styles.point} ${c.tone ? styles[c.tone] : ''}`}
            data-testid="line-point"
            cx={c.x}
            cy={c.y}
            r={3}
          >
            <title>{c.title ?? `${c.label}: ${c.value}`}</title>
          </circle>
        )
      )}
      {coords.map((c, i) =>
        labelIdx.has(i) ? (
          <text key={`xl-${i}`} className={styles.axis} x={c.x} y={height - 6} textAnchor="middle">
            {c.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

export interface UptimeBarDatum {
  label: string;
  /** 0-100, or null for no data */
  uptime: number | null;
  title?: string;
}

export interface SvgUptimeBarsProps {
  bars: UptimeBarDatum[];
  height?: number;
  ariaLabel: string;
}

function toneForUptime(uptime: number | null): string {
  if (uptime === null) return styles.noData;
  if (uptime >= 99) return styles.ok;
  if (uptime >= 95) return styles.warn;
  return styles.bad;
}

export function SvgUptimeBars({bars, height = 300, ariaLabel}: SvgUptimeBarsProps): JSX.Element {
  const usableW = VIEW_W - PAD.left - PAD.right;
  const usableH = height - PAD.top - PAD.bottom;
  const step = usableW / Math.max(bars.length, 1);
  // Clamp to the step so dense datasets never overlap neighbors.
  const barW = Math.min(Math.max(step * 0.7, 2), Math.max(step, 0.5));
  const labelIdx = new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1]);

  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
      style={{width: '100%', height: 'auto', maxHeight: height}}
    >
      {[0, 50, 100].map(t => (
        <g key={`tick-${t}`}>
          <line
            className={styles.grid}
            x1={PAD.left}
            x2={VIEW_W - PAD.right}
            y1={PAD.top + usableH * (1 - t / 100)}
            y2={PAD.top + usableH * (1 - t / 100)}
          />
          <text className={styles.axis} x={PAD.left - 6} y={PAD.top + usableH * (1 - t / 100) + 4} textAnchor="end">
            {t}%
          </text>
        </g>
      ))}
      {bars.map((bar, i) => {
        const h = bar.uptime === null ? usableH : (usableH * bar.uptime) / 100;
        // 0% (full downtime) must stay VISIBLE as a 2px sliver — Council
        // PR #88 r=1: the >0 guard made total outages disappear entirely.
        const minVisible = bar.uptime !== null ? Math.max(h, 2) : h;
        return (
          <rect
            key={i}
            className={`${styles.bar} ${toneForUptime(bar.uptime)}`}
            data-testid="uptime-bar"
            x={PAD.left + i * step + (step - barW) / 2}
            y={PAD.top + usableH - minVisible}
            width={barW}
            height={minVisible}
          >
            <title>{bar.title ?? `${bar.label}: ${bar.uptime === null ? 'no data' : `${bar.uptime.toFixed(2)}% uptime`}`}</title>
          </rect>
        );
      })}
      {bars.map((bar, i) =>
        labelIdx.has(i) ? (
          <text
            key={`xl-${i}`}
            className={styles.axis}
            x={PAD.left + i * step + step / 2}
            y={height - 6}
            textAnchor="middle"
          >
            {bar.label}
          </text>
        ) : null
      )}
    </svg>
  );
}
