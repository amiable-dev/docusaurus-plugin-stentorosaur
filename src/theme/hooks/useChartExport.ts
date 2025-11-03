/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { useCallback } from 'react';
import type { Chart } from 'chart.js';

export interface UseChartExportReturn {
  /** Export chart as PNG */
  exportPNG: (chart: Chart | null, filename: string) => void;
  /** Export chart as JPEG */
  exportJPEG: (chart: Chart | null, filename: string) => void;
  /** Copy chart to clipboard as PNG */
  copyToClipboard: (chart: Chart | null) => Promise<void>;
}

/**
 * Hook for exporting Chart.js charts in various formats
 */
export function useChartExport(): UseChartExportReturn {
  const exportPNG = useCallback((chart: Chart | null, filename: string) => {
    if (!chart) return;
    
    const url = chart.toBase64Image('image/png', 1);
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = url;
    link.click();
  }, []);

  const exportJPEG = useCallback((chart: Chart | null, filename: string) => {
    if (!chart) return;
    
    // For JPEG, we need to add a white background since Chart.js uses transparent background
    const canvas = chart.canvas;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;
    
    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw chart on top
    ctx.drawImage(canvas, 0, 0);
    
    const url = tempCanvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.download = `${filename}.jpg`;
    link.href = url;
    link.click();
  }, []);

  const copyToClipboard = useCallback(async (chart: Chart | null) => {
    if (!chart) return;
    
    try {
      const canvas = chart.canvas;
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/png');
      });
      
      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);
      
      // Could show a toast notification here
      console.log('Chart copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy chart to clipboard:', error);
    }
  }, []);

  return {
    exportPNG,
    exportJPEG,
    copyToClipboard,
  };
}
