/**
 * StatusPage — v1.0 (ADR-005 §4, tickets #72/#77).
 *
 * Snapshot-first: renders the build-time summary immediately, then
 * refreshes it live via useStatusSummary (SWR + ETag + backoff). All
 * chart drill-down data comes from status/v1/entities/<slug>.json under
 * the same base as the summary endpoint.
 */

import React, {useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import StatusBoard from '../StatusBoard';
import IncidentHistory from '../IncidentHistory';
import MaintenanceList from '../Maintenance/MaintenanceList';
import PerformanceMetrics from '../PerformanceMetrics';
import {SystemCard, SystemCardCharts, SystemCardDetails, SystemCardUptimeBar} from '../SystemCard';
import {StatusDataProvider} from '../../context/StatusDataProvider';
import type {StatusData, SystemStatusFile} from '../../types';
import {parseEntityDetail} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';
import {useStatusSummary} from '../../v1/useStatusSummary';
import {summaryToStatusData} from '../../v1/summary-adapter';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

const SUMMARY_FILE = '/summary.json';

/**
 * …/summary.json → its directory, where the v1 layout's entities/ lives.
 * Any mount that serves summary.json alongside entities/ works — not
 * just the canonical …/status/v1/ path (Council PR #92 r=1). A dataUrl
 * that is not a summary.json leaves drill-down disabled (undefined).
 */
export function deriveV1BaseUrl(dataUrl?: string): string | undefined {
  if (!dataUrl) return undefined;
  // Query/hash (cache busters etc.) are per-file — strip before deriving
  // the directory (Council PR #92 r=2).
  const clean = dataUrl.split(/[?#]/)[0];
  if (!clean.endsWith(SUMMARY_FILE)) return undefined;
  return clean.slice(0, -SUMMARY_FILE.length);
}

/** Same slug rules the probe uses for entity file names. */
export function entitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Entity detail readings → the chart-friendly SystemStatusFile shape. */
export function detailToSystemFile(detail: {
  name: string;
  generatedAt: string;
  readings: Array<{t: number; state: string; code: number; lat: number}>;
}): SystemStatusFile {
  const readings = [...detail.readings].sort((a, b) => a.t - b.t);
  const latest = readings[readings.length - 1];
  return {
    name: detail.name,
    url: '',
    lastChecked: detail.generatedAt,
    currentStatus: (latest?.state ?? 'up') as SystemStatusFile['currentStatus'],
    history: readings.map(r => ({
      timestamp: new Date(r.t).toISOString(),
      status: r.state as SystemStatusFile['currentStatus'],
      code: r.code,
      responseTime: r.lat,
    })),
  };
}

export default function StatusPage({statusData}: Props): JSX.Element {
  const snapshot = statusData.v1Summary as StatusSummary;
  const {summary} = useStatusSummary({snapshot, dataUrl: statusData.dataUrl});
  return <StatusPageInner statusData={statusData} summary={summary} />;
}

function StatusPageInner({
  statusData,
  summary,
}: Props & {summary: StatusSummary}): JSX.Element {
  const {
    title = 'System Status',
    description = 'Current operational status of our systems',
    showServices = true,
    showIncidents = true,
    showPerformanceMetrics = true,
    statusCardLayout = 'minimal',
    pluginVersion,
    repoUrl = '',
  } = statusData || {};

  const adapted = useMemo(
    () => summaryToStatusData(summary, {repoUrl}),
    [summary, repoUrl]
  );
  // Display metadata (displayName/description from plugin options) is
  // applied at BUILD time onto statusData.items; the live re-adapt from
  // the summary must not lose it (found by the runbook §2 validation —
  // cards fell back to raw entity names).
  const items = useMemo(
    () =>
      adapted.items.map(item => {
        const buildItem = statusData.items.find(i => i.name === item.name);
        return {
          ...item,
          displayName: item.displayName ?? buildItem?.displayName,
          description: buildItem?.description,
        };
      }),
    [adapted.items, statusData.items]
  );
  const {incidents, maintenance, lastUpdated} = adapted;

  const v1Base = useMemo(() => deriveV1BaseUrl(statusData.dataUrl), [statusData.dataUrl]);
  const [systemFiles, setSystemFiles] = useState<Map<string, SystemStatusFile>>(new Map());
  const [activeSystem, setActiveSystem] = useState<string | null>(null);

  // Fetch status/v1/entities/<slug>.json lazily on first expand.
  const loadEntityDetail = async (name: string): Promise<void> => {
    if (!v1Base || systemFiles.has(name)) return;
    try {
      const response = await fetch(`${v1Base}/entities/${entitySlug(name)}.json`, {
        headers: {accept: 'application/json'},
      });
      if (!response.ok) return;
      const detail = parseEntityDetail(JSON.parse(await response.text()));
      const file = detailToSystemFile(detail);
      // Carry the entity's 90-day daily rollups (already on the adapted
      // item) so the modal's long-range Uptime/SLI fill from them, like
      // the history page (#119).
      const days = items.find(i => i.name === name)?.days;
      if (days?.length) file.days = days;
      setSystemFiles(prev => new Map(prev).set(name, file));
    } catch {
      // Detail data is enhancement-only; the card still renders.
    }
  };

  const handleSystemClick = (name: string) => {
    if (!showPerformanceMetrics) return;
    void loadEntityDetail(name);
    setActiveSystem(prev => (prev === name ? null : name));
  };

  // The v1 summary carries only upcoming/in-progress windows — past
  // events live in the incident history and the atom feed.
  const upcomingMaintenance = maintenance.filter(
    m => m.status === 'upcoming' || m.status === 'in-progress'
  );
  const allOperational = items.every(item => item.status === 'up');
  const activeFile = activeSystem ? systemFiles.get(activeSystem) : undefined;

  const renderMinimalLayout = () => (
    <div className={styles.statusBoard}>
      <div className={styles.header}>
        <h1>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}

        <div className={styles.overallStatus}>
          {allOperational ? (
            <div className={styles.statusGood}>
              <span className={styles.statusDot} />
              All Systems Operational
            </div>
          ) : (
            <div className={styles.statusIssue}>
              <span className={styles.statusDot} />
              Some Systems Experiencing Issues
            </div>
          )}
        </div>
      </div>

      <div className={styles.systemCards}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No systems configured for monitoring.</p>
          </div>
        ) : (
          items.map(item => {
            // Resolved once: the loaded detail for THIS card while it is
            // the expanded one (undefined otherwise).
            const inlineFile =
              showPerformanceMetrics && activeSystem === item.name
                ? systemFiles.get(item.name)
                : undefined;
            return (
            <SystemCard
              key={item.name}
              name={item.name}
              displayName={item.displayName}
              status={item.status}
              expandable
              // Accordion controlled by activeSystem: expanding a card
              // makes it the single active one so its charts render
              // inline below its 90-day bar (others collapse).
              expanded={showPerformanceMetrics ? activeSystem === item.name : undefined}
              onExpandChange={
                showPerformanceMetrics
                  ? expanded => {
                      setActiveSystem(expanded ? item.name : null);
                      if (expanded) void loadEntityDetail(item.name);
                    }
                  : undefined
              }
            >
              <SystemCardUptimeBar serviceName={item.name} />
              {item.description && (
                <SystemCardDetails>
                  <p>{item.description}</p>
                </SystemCardDetails>
              )}
              {inlineFile && (
                <SystemCardCharts>
                  {/* Stop clicks inside the charts (period buttons,
                      enlarge) from bubbling to the card's toggle. */}
                  <div onClick={e => e.stopPropagation()}>
                    <PerformanceMetrics
                      systemFile={inlineFile}
                      incidents={incidents}
                      maintenance={maintenance}
                      isVisible={true}
                      onClose={() => setActiveSystem(null)}
                    />
                  </div>
                </SystemCardCharts>
              )}
            </SystemCard>
            );
          })
        )}
      </div>
    </div>
  );

  const renderDetailedLayout = () => (
    <StatusBoard
      items={items}
      incidents={incidents}
      maintenance={maintenance}
      title={title}
      description={description}
      onSystemClick={showPerformanceMetrics ? handleSystemClick : undefined}
      hasSystemData={showPerformanceMetrics ? () => Boolean(v1Base) : undefined}
    />
  );

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        <StatusDataProvider summary={summary}>
          {showServices &&
            (statusCardLayout === 'minimal' ? renderMinimalLayout() : renderDetailedLayout())}
        </StatusDataProvider>

        {/* Minimal layout renders each system's charts INLINE under its
            card (above). The detailed layout keeps the single
            board-level panel below the board. */}
        {statusCardLayout !== 'minimal' && showPerformanceMetrics && activeFile && (
          <PerformanceMetrics
            systemFile={activeFile}
            incidents={incidents}
            maintenance={maintenance}
            isVisible={true}
            onClose={() => setActiveSystem(null)}
          />
        )}

        {upcomingMaintenance.length > 0 && (
          <section className={styles.maintenanceSection}>
            <h2 className={styles.sectionTitle}>Scheduled Maintenance</h2>
            <MaintenanceList
              maintenance={upcomingMaintenance}
              filterStatus="all"
              showComments={true}
              showAffectedSystems={true}
              emptyMessage="No upcoming maintenance scheduled"
            />
          </section>
        )}

        {showIncidents && incidents.length > 0 && <IncidentHistory incidents={incidents} />}

        <div className={styles.footer}>
          <p className={styles.lastUpdated}>
            Last updated: {new Date(lastUpdated).toLocaleString('en-US', {timeZone: 'UTC'})} UTC
          </p>
          <p className={styles.poweredBy}>
            Powered by{' '}
            <a
              href="https://github.com/amiable-dev/docusaurus-plugin-stentorosaur"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docusaurus Stentorosaur Plugin{pluginVersion ? ` v${pluginVersion}` : ''}
            </a>
          </p>
        </div>
      </main>
    </Layout>
  );
}
