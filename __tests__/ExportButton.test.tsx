/**
 * Copyright (c) Your Organization
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportButton } from '../src/theme/components/ExportButton';
import { useDataExport } from '../src/theme/hooks/useDataExport';

// Mock the useDataExport hook
jest.mock('../src/theme/hooks/useDataExport', () => ({
  useDataExport: jest.fn(),
}));

describe('ExportButton', () => {
  const mockExportData = jest.fn();
  const mockUseDataExport = useDataExport as jest.MockedFunction<typeof useDataExport>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDataExport.mockReturnValue({
      exportData: mockExportData,
    });
  });

  const defaultProps = {
    filename: 'test-data',
    data: [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ],
  };

  it('should render export button with CSV format by default', () => {
    render(<ExportButton {...defaultProps} />);
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('should render with JSON format', () => {
    render(<ExportButton {...defaultProps} format="json" />);
    
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('should call exportData when clicked with CSV format', () => {
    render(<ExportButton {...defaultProps} format="csv" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockExportData).toHaveBeenCalledWith({
      filename: 'test-data',
      format: 'csv',
      data: defaultProps.data,
      columns: undefined,
    });
  });

  it('should call exportData when clicked with JSON format', () => {
    render(<ExportButton {...defaultProps} format="json" />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockExportData).toHaveBeenCalledWith({
      filename: 'test-data',
      format: 'json',
      data: defaultProps.data,
      columns: undefined,
    });
  });

  it('should pass columns to exportData when provided', () => {
    const columns = ['name', 'age'];
    render(<ExportButton {...defaultProps} columns={columns} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockExportData).toHaveBeenCalledWith({
      filename: 'test-data',
      format: 'csv',
      data: defaultProps.data,
      columns,
    });
  });

  it('should have default aria-label', () => {
    render(<ExportButton {...defaultProps} format="csv" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Download test-data as CSV');
  });

  it('should use custom aria-label when provided', () => {
    render(
      <ExportButton
        {...defaultProps}
        ariaLabel="Custom download label"
      />
    );
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Custom download label');
  });

  it('should apply custom className', () => {
    render(<ExportButton {...defaultProps} className="custom-class" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should render download icon SVG', () => {
    render(<ExportButton {...defaultProps} />);
    
    const svg = screen.getByRole('button').querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('should have button type attribute', () => {
    render(<ExportButton {...defaultProps} />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('should handle empty data array', () => {
    render(<ExportButton {...defaultProps} data={[]} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockExportData).toHaveBeenCalledWith({
      filename: 'test-data',
      format: 'csv',
      data: [],
      columns: undefined,
    });
  });

  it('should format aria-label with uppercase format', () => {
    render(<ExportButton {...defaultProps} format="json" />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Download test-data as JSON');
  });
});
