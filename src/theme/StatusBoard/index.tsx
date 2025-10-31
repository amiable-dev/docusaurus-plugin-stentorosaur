/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import type {StatusItem as StatusItemType} from '../../types';
import StatusItem from '../StatusItem';
import styles from './styles.module.css';

export interface Props {
  items: StatusItemType[];
  title?: string;
  description?: string;
}

export default function StatusBoard({
  items,
  title = 'System Status',
  description,
}: Props): JSX.Element {
  const allOperational = items.every((item) => item.status === 'up');

  return (
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

      <div className={styles.statusList}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No systems configured for monitoring.</p>
          </div>
        ) : (
          items.map((item, index) => (
            <StatusItem key={`${item.name}-${index}`} item={item} />
          ))
        )}
      </div>
    </div>
  );
}
