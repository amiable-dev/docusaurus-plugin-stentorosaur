/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import { useDataExport, DataExportFormat } from '../hooks/useDataExport';
import styles from './ExportButton.module.css';

export interface ExportButtonProps {
  /**
   * Name of the file to download (without extension)
   */
  filename: string;
  
  /**
   * Array of data objects to export
   */
  data: any[];
  
  /**
   * Optional array of column names to include in CSV export
   */
  columns?: string[];
  
  /**
   * Export format (csv or json)
   */
  format?: DataExportFormat;
  
  /**
   * Optional CSS class name
   */
  className?: string;
  
  /**
   * Optional accessible label
   */
  ariaLabel?: string;
}

/**
 * Button component for exporting chart data
 * 
 * @example
 * ```tsx
 * <ExportButton
 *   filename="response-time-data"
 *   data={chartData}
 *   columns={['timestamp', 'responseTime', 'status']}
 *   format="csv"
 *   ariaLabel="Download response time data as CSV"
 * />
 * ```
 */
export function ExportButton({
  filename,
  data,
  columns,
  format = 'csv',
  className,
  ariaLabel,
}: ExportButtonProps): JSX.Element {
  const { exportData } = useDataExport();

  const handleClick = () => {
    exportData({
      filename,
      format,
      data,
      columns,
    });
  };

  const defaultAriaLabel = `Download ${filename} as ${format.toUpperCase()}`;

  return (
    <button
      onClick={handleClick}
      className={`${styles.exportButton} ${className || ''}`}
      aria-label={ariaLabel || defaultAriaLabel}
      type="button"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M8 11.5L4 7.5L5.41 6.09L7 7.67V1H9V7.67L10.59 6.09L12 7.5L8 11.5Z"
          fill="currentColor"
        />
        <path
          d="M14 14H2V9H0V14C0 15.1 0.9 16 2 16H14C15.1 16 16 15.1 16 14V9H14V14Z"
          fill="currentColor"
        />
      </svg>
      <span className={styles.formatLabel}>{format.toUpperCase()}</span>
    </button>
  );
}
