/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Escapes a value for CSV format
 * - Wraps in quotes if contains comma, quote, or newline
 * - Doubles internal quotes
 */
export function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  
  // Check if value needs escaping
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    // Escape quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * Converts an array of objects to CSV format
 * 
 * @param data - Array of objects to convert
 * @param columns - Optional array of column names to include (defaults to all keys from first object)
 * @returns CSV string with header row and data rows
 */
export function convertToCSV(data: any[], columns?: string[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  // Use provided columns or extract from first object
  const headers = columns || Object.keys(data[0]);
  
  if (headers.length === 0) {
    return '';
  }

  // Create header row
  const csvRows: string[] = [headers.map(escapeCSVValue).join(',')];

  // Create data rows
  for (const row of data) {
    const values = headers.map(header => escapeCSVValue(row[header]));
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Triggers a file download in the browser
 * 
 * @param content - File content as string
 * @param filename - Name of the file to download
 * @param mimeType - MIME type of the file
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  // Create blob from content
  const blob = new Blob([content], { type: mimeType });
  
  // Create object URL
  const url = URL.createObjectURL(blob);
  
  // Create temporary link and trigger download
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up object URL
  URL.revokeObjectURL(url);
}

/**
 * Formats a date for use in filenames (YYYY-MM-DD)
 */
export function formatDateForFilename(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Sanitizes a string for use in filenames
 * Removes or replaces characters that are invalid in filenames
 */
export function sanitizeFilename(name: string): string {
  // Replace invalid filename characters: / \ : * ? " < > |
  return name.replace(/[/\\:*?"<>|]/g, '_');
}
