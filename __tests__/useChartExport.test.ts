/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useChartExport } from '../src/theme/hooks/useChartExport';
import type { Chart } from 'chart.js';

// Mock ClipboardItem for jsdom
class MockClipboardItem {
  constructor(public data: Record<string, Blob>) {}
}
global.ClipboardItem = MockClipboardItem as any;

// Mock Chart instance
const createMockChart = (canvasDataUrl = 'data:image/png;base64,mock'): Chart => {
  const mockCanvas = document.createElement('canvas');
  mockCanvas.width = 800;
  mockCanvas.height = 600;
  
  // Mock toBlob
  mockCanvas.toBlob = jest.fn((callback: BlobCallback) => {
    const blob = new Blob(['mock image data'], { type: 'image/png' });
    callback(blob);
  });
  
  // Mock getContext for the tempCanvas in exportJPEG
  const originalGetContext = mockCanvas.getContext.bind(mockCanvas);
  mockCanvas.getContext = jest.fn((contextType: string) => {
    if (contextType === '2d') {
      return {
        fillRect: jest.fn(),
        drawImage: jest.fn(),
      } as any;
    }
    return originalGetContext(contextType);
  });

  return {
    canvas: mockCanvas,
    toBase64Image: jest.fn(() => canvasDataUrl),
  } as unknown as Chart;
};

describe('useChartExport', () => {
  let mockLink: HTMLAnchorElement;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Mock document.createElement for <a> element
    mockLink = document.createElement('a');
    mockLink.click = jest.fn();

    originalCreateElement = document.createElement;
    document.createElement = jest.fn((tagName: string) => {
      if (tagName === 'a') {
        return mockLink;
      }
      if (tagName === 'canvas') {
        const canvas = originalCreateElement.call(document, 'canvas') as HTMLCanvasElement;
        // Mock toDataURL for JPEG export
        canvas.toDataURL = jest.fn(() => 'data:image/jpeg;base64,mock');
        // Mock getContext for the tempCanvas
        canvas.getContext = jest.fn((contextType: string) => {
          if (contextType === '2d') {
            return {
              fillRect: jest.fn(),
              drawImage: jest.fn(),
            } as any;
          }
          return null;
        });
        return canvas;
      }
      return originalCreateElement.call(document, tagName);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    jest.clearAllMocks();
  });

  describe('exportPNG', () => {
    it('should export chart as PNG', () => {
      const { result } = renderHook(() => useChartExport());
      const mockChart = createMockChart();

      act(() => {
        result.current.exportPNG(mockChart, 'test-chart');
      });

      expect(mockChart.toBase64Image).toHaveBeenCalledWith('image/png', 1);
      expect(mockLink.download).toBe('test-chart.png');
      expect(mockLink.href).toBe('data:image/png;base64,mock');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should handle null chart gracefully', () => {
      const { result } = renderHook(() => useChartExport());

      act(() => {
        result.current.exportPNG(null, 'test-chart');
      });

      expect(mockLink.click).not.toHaveBeenCalled();
    });

    it('should use provided filename', () => {
      const { result } = renderHook(() => useChartExport());
      const mockChart = createMockChart();

      act(() => {
        result.current.exportPNG(mockChart, 'my-custom-chart-name');
      });

      expect(mockLink.download).toBe('my-custom-chart-name.png');
    });
  });

  describe('exportJPEG', () => {
    it('should export chart as JPEG with white background', () => {
      const { result } = renderHook(() => useChartExport());
      const mockChart = createMockChart();

      act(() => {
        result.current.exportJPEG(mockChart, 'test-chart');
      });

      expect(mockLink.download).toBe('test-chart.jpg');
      expect(mockLink.href).toBe('data:image/jpeg;base64,mock');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should handle null chart gracefully', () => {
      const { result } = renderHook(() => useChartExport());

      act(() => {
        result.current.exportJPEG(null, 'test-chart');
      });

      expect(mockLink.click).not.toHaveBeenCalled();
    });

    it('should handle missing canvas context', () => {
      const { result } = renderHook(() => useChartExport());
      const mockChart = createMockChart();

      // Override createElement to return canvas without context
      document.createElement = jest.fn((tagName: string) => {
        if (tagName === 'a') {
          return mockLink;
        }
        if (tagName === 'canvas') {
          const canvas = originalCreateElement.call(document, 'canvas') as HTMLCanvasElement;
          canvas.getContext = jest.fn(() => null);
          return canvas;
        }
        return originalCreateElement.call(document, tagName);
      }) as typeof document.createElement;

      act(() => {
        result.current.exportJPEG(mockChart, 'test-chart');
      });

      // Should return early without clicking
      expect(mockLink.click).not.toHaveBeenCalled();
    });
  });

  describe('copyToClipboard', () => {
    let mockClipboard: {
      write: jest.Mock;
    };

    beforeEach(() => {
      mockClipboard = {
        write: jest.fn().mockResolvedValue(undefined),
      };

      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
        configurable: true,
      });

      // Mock console.log and console.error
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should copy chart to clipboard as PNG', async () => {
      const { result } = renderHook(() => useChartExport());
      const mockChart = createMockChart();

      await act(async () => {
        await result.current.copyToClipboard(mockChart);
      });

      expect(mockChart.canvas.toBlob).toHaveBeenCalled();
      expect(mockClipboard.write).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Chart copied to clipboard!');
    });

    it('should handle null chart gracefully', async () => {
      const { result } = renderHook(() => useChartExport());

      await act(async () => {
        await result.current.copyToClipboard(null);
      });

      expect(mockClipboard.write).not.toHaveBeenCalled();
    });

    it('should handle clipboard write failure', async () => {
      const { result } = renderHook(() => useChartExport());
      const mockChart = createMockChart();
      const error = new Error('Clipboard access denied');

      mockClipboard.write.mockRejectedValue(error);

      await act(async () => {
        await result.current.copyToClipboard(mockChart);
      });

      expect(console.error).toHaveBeenCalledWith(
        'Failed to copy chart to clipboard:',
        expect.any(Error)
      );
    });

    it('should handle blob creation failure', async () => {
      const { result } = renderHook(() => useChartExport());
      const mockCanvas = document.createElement('canvas');
      mockCanvas.toBlob = jest.fn((callback: BlobCallback) => {
        callback(null);
      });

      const mockChart = {
        canvas: mockCanvas,
        toBase64Image: jest.fn(() => 'data:image/png;base64,mock'),
      } as unknown as Chart;

      await act(async () => {
        await result.current.copyToClipboard(mockChart);
      });

      expect(console.error).toHaveBeenCalledWith(
        'Failed to copy chart to clipboard:',
        expect.any(Error)
      );
    });
  });

  describe('hook stability', () => {
    it('should return stable function references', () => {
      const { result, rerender } = renderHook(() => useChartExport());

      const firstExportPNG = result.current.exportPNG;
      const firstExportJPEG = result.current.exportJPEG;
      const firstCopyToClipboard = result.current.copyToClipboard;

      rerender();

      expect(result.current.exportPNG).toBe(firstExportPNG);
      expect(result.current.exportJPEG).toBe(firstExportJPEG);
      expect(result.current.copyToClipboard).toBe(firstCopyToClipboard);
    });
  });
});
