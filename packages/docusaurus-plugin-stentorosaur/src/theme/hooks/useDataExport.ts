/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useCallback } from 'react';
import { convertToCSV, downloadFile } from '../../utils/csv';

export type DataExportFormat = 'csv' | 'json';

export interface DataExportOptions {
  /**
   * Name of the file to download (without extension)
   */
  filename: string;
  
  /**
   * Format to export the data in
   */
  format: DataExportFormat;
  
  /**
   * Array of data objects to export
   */
  data: any[];
  
  /**
   * Optional array of column names to include in CSV export
   * If not provided, all keys from the first object will be used
   */
  columns?: string[];
}

/**
 * Hook for exporting chart data in various formats
 * 
 * @returns Object containing exportData function
 * 
 * @example
 * ```tsx
 * const { exportData } = useDataExport();
 * 
 * const handleExport = () => {
 *   exportData({
 *     filename: 'response-time-data',
 *     format: 'csv',
 *     data: chartData,
 *     columns: ['timestamp', 'responseTime', 'status']
 *   });
 * };
 * ```
 */
export function useDataExport() {
  const exportData = useCallback((options: DataExportOptions) => {
    const { filename, format, data, columns } = options;

    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }

    let content: string;
    let mimeType: string;
    let fileExtension: string;

    if (format === 'csv') {
      content = convertToCSV(data, columns);
      mimeType = 'text/csv;charset=utf-8;';
      fileExtension = 'csv';
    } else if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json;charset=utf-8;';
      fileExtension = 'json';
    } else {
      console.error(`Unsupported export format: ${format}`);
      return;
    }

    const fullFilename = `${filename}.${fileExtension}`;
    downloadFile(content, fullFilename, mimeType);
  }, []);

  return { exportData };
}
