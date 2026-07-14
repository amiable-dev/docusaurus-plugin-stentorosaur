/**
 * UptimeStatusPage — Upptime-style structured layout, v1.0 (ADR-005).
 *
 * Snapshot-first render from the build-time summary, live refresh via
 * useStatusSummary, and per-entity chart data fetched lazily from
 * status/v1/entities/<slug>.json (same base as the summary endpoint).
 */

import React, {useMemo, useState} from 'react';
import Layout from '@theme/Layout';
import IncidentHistory from '../IncidentHistory';
import MaintenanceList from '../Maintenance/MaintenanceList';
import StatusBoard from '../StatusBoard';
import PerformanceMetrics from '../PerformanceMetrics';
import {StatusDataProvider} from '../../context/StatusDataProvider';
import type {StatusData, UptimeStatusPageConfig, SystemStatusFile} from '../../types';
import {parseEntityDetail} from '@stentorosaur/core';
import type {StatusSummary} from '@stentorosaur/core';
import {useStatusSummary} from '../../v1/useStatusSummary';
import {summaryToStatusData} from '../../v1/summary-adapter';
import {deriveV1BaseUrl, detailToSystemFile, entitySlug} from '../StatusPage';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

const DEFAULT_CONFIG: UptimeStatusPageConfig = {
  sections: [
    {id: 'active-incidents', enabled: true},
    {id: 'live-status', enabled: true},
    {id: 'charts', enabled: true},
    {id: 'scheduled-maintenance', enabled: true},
    {id: 'past-maintenance', enabled: true},
    {id: 'past-incidents', enabled: true},
  ],
};

export default function UptimeStatusPage({statusData}: Props): JSX.Element {
  const snapshot = statusData.v1Summary as StatusSummary;
  const {summary} = useStatusSummary({snapshot, dataUrl: statusData.dataUrl});

  const {
    title = 'System Status',
    description = 'Current operational status of our systems',
    repoUrl = '',
  } = statusData || {};

  const adapted = useMemo(() => summaryToStatusData(summary, {repoUrl}), [summary, repoUrl]);
  // Preserve build-time display metadata across the live re-adapt (§2).
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
  const {incidents, maintenance} = adapted;

  const v1Base = useMemo(() => deriveV1BaseUrl(statusData.dataUrl), [statusData.dataUrl]);
  const [systemFiles, setSystemFiles] = useState<Map<string, SystemStatusFile>>(new Map());
  const [activeSystem, setActiveSystem] = useState<string | null>(null);

  const config = statusData.uptimeConfig ?? DEFAULT_CONFIG;
  const sectionTitles = {
    'active-incidents': '🚨 Active Incidents',
    'live-status': '📊 Live System Status',
    charts: '📈 Performance Charts',
    'scheduled-maintenance': '🔧 Scheduled Maintenance',
    'past-maintenance': '✅ Past Maintenance',
    'past-incidents': '📜 Past Incidents',
    ...config.sectionTitles,
  };

  const loadEntityDetail = async (name: string): Promise<void> => {
    if (!v1Base || systemFiles.has(name)) return;
    try {
      const response = await fetch(`${v1Base}/entities/${entitySlug(name)}.json`, {
        headers: {accept: 'application/json'},
      });
      if (!response.ok) return;
      const detail = parseEntityDetail(JSON.parse(await response.text()));
      setSystemFiles(prev => new Map(prev).set(name, detailToSystemFile(detail)));
    } catch {
      // Chart data is enhancement-only.
    }
  };

  const handleSystemClick = (systemName: string) => {
    void loadEntityDetail(systemName);
    setActiveSystem(prev => (prev === systemName ? null : systemName));
  };

  const activeIncidents = incidents.filter(i => i.status === 'open');
  const pastIncidents = incidents.filter(i => i.status === 'closed');
  // v1 carries only upcoming/in-progress maintenance (see StatusPage).
  const upcomingMaintenance = maintenance.filter(
    m => m.status === 'upcoming' || m.status === 'in-progress'
  );

  const isEnabled = (id: string) => config.sections.find(s => s.id === id)?.enabled ?? true;
  const activeFile = activeSystem ? systemFiles.get(activeSystem) : undefined;

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        <div className="container">
          <header className={styles.header}>
            <h1>{title}</h1>
            <p className={styles.description}>{description}</p>
          </header>

          {isEnabled('active-incidents') && activeIncidents.length > 0 && (
            <IncidentHistory
              incidents={activeIncidents}
              title={sectionTitles['active-incidents']}
            />
          )}

          {isEnabled('live-status') && (
            <StatusDataProvider summary={summary}>
              <StatusBoard
                items={items}
                incidents={incidents}
                maintenance={maintenance}
                title={sectionTitles['live-status']}
                onSystemClick={handleSystemClick}
                hasSystemData={() => Boolean(v1Base)}
              />
              {activeFile && (
                <PerformanceMetrics
                  systemFile={activeFile}
                  incidents={incidents}
                  maintenance={maintenance}
                  isVisible={true}
                  onClose={() => setActiveSystem(null)}
                />
              )}
            </StatusDataProvider>
          )}

          {isEnabled('scheduled-maintenance') && upcomingMaintenance.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>{sectionTitles['scheduled-maintenance']}</h2>
              <MaintenanceList
                maintenance={upcomingMaintenance}
                filterStatus="all"
                showComments={true}
                showAffectedSystems={true}
                emptyMessage="No upcoming maintenance scheduled"
              />
            </section>
          )}

          {isEnabled('past-incidents') && pastIncidents.length > 0 && (
            <IncidentHistory incidents={pastIncidents} title={sectionTitles['past-incidents']} />
          )}
        </div>
      </main>
    </Layout>
  );
}
