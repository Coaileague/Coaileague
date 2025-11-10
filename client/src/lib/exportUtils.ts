/**
 * Export Utilities - CSV and PDF generation for reports
 * 
 * Simple functions to export data from any report page
 * No IT knowledge required - just pass your data and get a file!
 */

import { format } from "date-fns";

/**
 * Convert an array of objects to CSV format
 */
export function convertToCSV(data: Record<string, any>[], headers?: string[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  // Use provided headers or extract from first row
  const csvHeaders = headers || Object.keys(data[0]);
  
  // Create header row
  const headerRow = csvHeaders.join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return csvHeaders.map(header => {
      const value = row[header];
      
      // Handle different data types
      if (value === null || value === undefined) {
        return '';
      }
      
      // Format dates
      if (value instanceof Date) {
        return `"${format(value, 'yyyy-MM-dd HH:mm:ss')}"`;
      }
      
      // Escape strings with commas or quotes
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download CSV file to user's computer
 */
export function downloadCSV(
  data: Record<string, any>[],
  filename: string,
  headers?: string[]
): void {
  const csv = convertToCSV(data, headers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Generate PDF using browser's print functionality
 * This creates a clean, printable version of the current page
 */
export function generatePDF(
  title: string,
  data: Record<string, any>[],
  options?: {
    orientation?: 'portrait' | 'landscape';
    columns?: string[];
    columnLabels?: Record<string, string>;
    onPopupBlocked?: () => void;
  }
): void {
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  
  if (!printWindow) {
    // Handle popup blocker gracefully
    if (options?.onPopupBlocked) {
      options.onPopupBlocked();
    }
    return;
  }
  
  const columns = options?.columns || Object.keys(data[0] || {});
  const columnLabels = options?.columnLabels || {};
  
  // Build HTML table
  const tableHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            @page {
              size: ${options?.orientation === 'landscape' ? 'landscape' : 'portrait'};
              margin: 0.5in;
            }
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            color: #1f2937;
          }
          
          h1 {
            font-size: 24px;
            margin-bottom: 8px;
            color: #111827;
          }
          
          .metadata {
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 24px;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          
          thead {
            background-color: #f3f4f6;
          }
          
          th {
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #d1d5db;
            color: #374151;
          }
          
          td {
            padding: 10px 8px;
            border-bottom: 1px solid #e5e7eb;
          }
          
          tbody tr:hover {
            background-color: #f9fafb;
          }
          
          .footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
            font-size: 10px;
            color: #9ca3af;
            text-align: center;
          }
          
          .no-data {
            padding: 40px;
            text-align: center;
            color: #9ca3af;
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="metadata">
          Generated on ${format(new Date(), 'MMMM dd, yyyy')} at ${format(new Date(), 'h:mm a')}
        </div>
        
        ${data.length === 0 ? `
          <div class="no-data">No data available for this report</div>
        ` : `
          <table>
            <thead>
              <tr>
                ${columns.map(col => `<th>${columnLabels[col] || col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.map(row => `
                <tr>
                  ${columns.map(col => {
                    const value = row[col];
                    let displayValue = '';
                    
                    if (value === null || value === undefined) {
                      displayValue = '-';
                    } else if (value instanceof Date) {
                      displayValue = format(value, 'MMM dd, yyyy');
                    } else if (typeof value === 'number') {
                      displayValue = value.toLocaleString();
                    } else {
                      displayValue = String(value);
                    }
                    
                    return `<td>${displayValue}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
        
        <div class="footer">
          AutoForce™ - Autonomous Workforce Management Platform
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            // Close after printing (or cancel)
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `;
  
  printWindow.document.write(tableHTML);
  printWindow.document.close();
}

/**
 * Simple helper to format report filename with timestamp
 */
export function createReportFilename(baseName: string, extension: 'csv' | 'pdf'): string {
  const timestamp = format(new Date(), 'yyyy-MM-dd_HHmmss');
  return `${baseName}_${timestamp}.${extension}`;
}

/**
 * Export data as CSV or PDF based on user choice
 */
export function exportReport(
  format: 'csv' | 'pdf',
  title: string,
  data: Record<string, any>[],
  options?: {
    filename?: string;
    headers?: string[];
    columns?: string[];
    columnLabels?: Record<string, string>;
    orientation?: 'portrait' | 'landscape';
    onPopupBlocked?: () => void;
  }
): void {
  const filename = options?.filename || createReportFilename(
    title.toLowerCase().replace(/\s+/g, '-'),
    format
  );
  
  if (format === 'csv') {
    downloadCSV(data, filename.replace('.csv', ''), options?.headers || options?.columns);
  } else {
    generatePDF(title, data, {
      columns: options?.columns,
      columnLabels: options?.columnLabels,
      orientation: options?.orientation,
      onPopupBlocked: options?.onPopupBlocked,
    });
  }
}
