/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import Layout from '@theme/Layout';
import StatusBoard from '@theme/StatusBoard';
import IncidentHistory from '@theme/IncidentHistory';
import type {StatusData} from '../../types';
import styles from './styles.module.css';

export interface Props {
  readonly statusData: StatusData;
}

export default function StatusPage({statusData}: Props): JSX.Element {
  const {items, incidents, lastUpdated, showServices = true, showIncidents = true} = statusData;
  
  // Default values if not provided
  const title = 'System Status';
  const description = 'Current operational status of our systems';

  return (
    <Layout title={title} description={description}>
      <main className={styles.statusPage}>
        {showServices && (
          <StatusBoard 
            items={items} 
            title={title} 
            description={description} 
          />
        )}
        
        {showIncidents && incidents && incidents.length > 0 && (
          <IncidentHistory incidents={incidents} />
        )}

        <div className={styles.footer}>
          <p className={styles.lastUpdated}>
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </p>
          <p className={styles.poweredBy}>
            Powered by{' '}
            <a
              href="https://github.com/amiable-dev/docusaurus-plugin-stentorosaur"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docusaurus Stentorosaur Plugin
            </a>
          </p>
        </div>
      </main>
    </Layout>
  );
}
