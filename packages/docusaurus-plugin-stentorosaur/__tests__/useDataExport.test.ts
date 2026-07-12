/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useDataExport } from '../src/theme/hooks/useDataExport';
import * as csvUtils from '../src/utils/csv';

// Mock the CSV utilities
jest.mock('../src/utils/csv', () => ({
  convertToCSV: jest.fn((data) => 'mocked,csv,content'),
  downloadFile: jest.fn(),
}));

describe('useDataExport', () => {
  const mockConvertToCSV = csvUtils.convertToCSV as jest.MockedFunction<typeof csvUtils.convertToCSV>;
  const mockDownloadFile = csvUtils.downloadFile as jest.MockedFunction<typeof csvUtils.downloadFile>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.warn and console.error
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.warn as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  it('should export data as CSV', () => {
    const { result } = renderHook(() => useDataExport());
    const testData = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];

    act(() => {
      result.current.exportData({
        filename: 'test-data',
        format: 'csv',
        data: testData,
      });
    });

    expect(mockConvertToCSV).toHaveBeenCalledWith(testData, undefined);
    expect(mockDownloadFile).toHaveBeenCalledWith(
      'mocked,csv,content',
      'test-data.csv',
      'text/csv;charset=utf-8;'
    );
  });

  it('should export data as CSV with specific columns', () => {
    const { result } = renderHook(() => useDataExport());
    const testData = [
      { name: 'Alice', age: 30, city: 'NYC' },
      { name: 'Bob', age: 25, city: 'LA' },
    ];
    const columns = ['name', 'age'];

    act(() => {
      result.current.exportData({
        filename: 'test-data',
        format: 'csv',
        data: testData,
        columns,
      });
    });

    expect(mockConvertToCSV).toHaveBeenCalledWith(testData, columns);
    expect(mockDownloadFile).toHaveBeenCalledWith(
      'mocked,csv,content',
      'test-data.csv',
      'text/csv;charset=utf-8;'
    );
  });

  it('should export data as JSON', () => {
    const { result } = renderHook(() => useDataExport());
    const testData = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];

    act(() => {
      result.current.exportData({
        filename: 'test-data',
        format: 'json',
        data: testData,
      });
    });

    expect(mockConvertToCSV).not.toHaveBeenCalled();
    expect(mockDownloadFile).toHaveBeenCalledWith(
      JSON.stringify(testData, null, 2),
      'test-data.json',
      'application/json;charset=utf-8;'
    );
  });

  it('should warn when data is empty', () => {
    const { result } = renderHook(() => useDataExport());

    act(() => {
      result.current.exportData({
        filename: 'empty-data',
        format: 'csv',
        data: [],
      });
    });

    expect(console.warn).toHaveBeenCalledWith('No data to export');
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('should warn when data is null', () => {
    const { result } = renderHook(() => useDataExport());

    act(() => {
      result.current.exportData({
        filename: 'null-data',
        format: 'csv',
        data: null as any,
      });
    });

    expect(console.warn).toHaveBeenCalledWith('No data to export');
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('should error on unsupported format', () => {
    const { result } = renderHook(() => useDataExport());
    const testData = [{ name: 'Alice' }];

    act(() => {
      result.current.exportData({
        filename: 'test-data',
        format: 'xml' as any,
        data: testData,
      });
    });

    expect(console.error).toHaveBeenCalledWith('Unsupported export format: xml');
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('should handle complex nested data in JSON', () => {
    const { result } = renderHook(() => useDataExport());
    const testData = [
      { name: 'Alice', metadata: { role: 'admin', permissions: ['read', 'write'] } },
      { name: 'Bob', metadata: { role: 'user', permissions: ['read'] } },
    ];

    act(() => {
      result.current.exportData({
        filename: 'complex-data',
        format: 'json',
        data: testData,
      });
    });

    expect(mockDownloadFile).toHaveBeenCalledWith(
      JSON.stringify(testData, null, 2),
      'complex-data.json',
      'application/json;charset=utf-8;'
    );
  });

  it('should be memoized and not recreate function on every render', () => {
    const { result, rerender } = renderHook(() => useDataExport());
    const firstExportData = result.current.exportData;

    rerender();
    const secondExportData = result.current.exportData;

    expect(firstExportData).toBe(secondExportData);
  });
});
