/**
 * Migration Configuration - Universal & Dynamic
 * Eliminates hardcoded values in data migration and PDF extraction workflows
 * Centralized configuration for AI model settings, default values, and extraction templates
 */

export const migrationConfig = {
  // AI Model Configuration
  aiModel: {
    provider: process.env.VITE_AI_MIGRATION_PROVIDER || 'gemini',
    modelName: process.env.VITE_AI_MIGRATION_MODEL || 'gemini-2.0-flash-exp',
    apiKey: process.env.GEMINI_API_KEY,
  },

  // Default Values for Schedule Import
  scheduleDefaults: {
    defaultStartTime: process.env.VITE_SCHEDULE_DEFAULT_START_TIME || '09:00',
    defaultEndTime: process.env.VITE_SCHEDULE_DEFAULT_END_TIME || '17:00',
    defaultStatus: process.env.VITE_SCHEDULE_DEFAULT_STATUS || 'published',
  },

  // Default Values for Payroll Import
  payrollDefaults: {
    defaultStatus: process.env.VITE_PAYROLL_DEFAULT_STATUS || 'draft',
    defaultHourlyRate: parseFloat(process.env.VITE_PAYROLL_DEFAULT_RATE || '0.00'),
  },

  // Default Values for Invoice Import
  invoiceDefaults: {
    defaultStatus: process.env.VITE_INVOICE_DEFAULT_STATUS || 'draft',
    defaultTaxRate: parseFloat(process.env.VITE_INVOICE_DEFAULT_TAX || '0.00'),
    invoiceDueDaysOffset: parseInt(process.env.VITE_INVOICE_DUE_DAYS || '30', 10),
  },

  // Default Values for Timesheet Import
  timesheetDefaults: {
    defaultStatus: process.env.VITE_TIMESHEET_DEFAULT_STATUS || 'pending',
  },

  // ID Generation Prefixes (Dynamic)
  idPrefixes: {
    job: process.env.VITE_MIGRATION_JOB_PREFIX || 'MIG',
    document: process.env.VITE_MIGRATION_DOC_PREFIX || 'DOC',
    record: process.env.VITE_MIGRATION_REC_PREFIX || 'REC',
  },

  // PDF Document Classification
  documentClassification: {
    schedules: {
      mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
      keywords: ['schedule', 'shift', 'roster', 'timetable', 'assignment'],
      extractionTemplate: 'schedules',
    },
    payroll: {
      mimeTypes: ['application/pdf', 'application/vnd.ms-excel'],
      keywords: ['payroll', 'salary', 'wages', 'compensation', 'hours', 'overtime'],
      extractionTemplate: 'payroll',
    },
    invoices: {
      mimeTypes: ['application/pdf'],
      keywords: ['invoice', 'bill', 'receipt', 'billing', 'charges'],
      extractionTemplate: 'invoices',
    },
    timesheets: {
      mimeTypes: ['application/pdf', 'application/vnd.ms-excel'],
      keywords: ['timesheet', 'hours', 'time', 'attendance', 'daily', 'weekly'],
      extractionTemplate: 'timesheets',
    },
    employees: {
      mimeTypes: ['application/pdf', 'text/csv'],
      keywords: ['employee', 'staff', 'personnel', 'roster', 'directory', 'contact'],
      extractionTemplate: 'employees',
    },
  },

  // AI Extraction Prompts (Configurable)
  extractionPrompts: {
    employees: `Extract employee data. Each record should have:
{
  "recordType": "employees",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "role": "Manager",
    "hourlyRate": 25.00,
    "status": "active"
  },
  "confidence": 0.95,
  "warnings": []
}`,
    schedules: `Extract schedule/shift data. Each record should have:
{
  "recordType": "schedules",
  "data": {
    "employeeName": "John Doe",
    "date": "2024-01-15",
    "startTime": "09:00",
    "endTime": "17:00",
    "role": "Manager",
    "location": "Downtown Office"
  },
  "confidence": 0.95,
  "warnings": []
}`,
    payroll: `Extract payroll data. Each record should have:
{
  "recordType": "payroll",
  "data": {
    "employeeName": "John Doe",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-15",
    "regularHours": 80,
    "overtimeHours": 5,
    "grossPay": 2125.00
  },
  "confidence": 0.95,
  "warnings": []
}`,
    invoices: `Extract invoice data. Each record should have:
{
  "recordType": "invoices",
  "data": {
    "clientName": "ABC Corp",
    "invoiceNumber": "INV-001",
    "date": "2024-01-15",
    "amount": 1500.00,
    "dueDate": "2024-02-15",
    "items": [{"description": "Service", "amount": 1500}]
  },
  "confidence": 0.95,
  "warnings": []
}`,
    clients: `Extract client data. Each record should have:
{
  "recordType": "clients",
  "data": {
    "name": "ABC Corp",
    "contactName": "Jane Smith",
    "email": "jane@abc.com",
    "phone": "+1234567890",
    "billingRate": 75.00
  },
  "confidence": 0.95,
  "warnings": []
}`,
    timesheets: `Extract timesheet data. Each record should have:
{
  "recordType": "timesheets",
  "data": {
    "employeeName": "John Doe",
    "date": "2024-01-15",
    "hoursWorked": 8,
    "notes": "Regular shift"
  },
  "confidence": 0.95,
  "warnings": []
}`,
  },

  // Fuzzy Matching Thresholds
  fuzzyMatching: {
    employeeNameThreshold: parseFloat(process.env.VITE_FUZZY_EMPLOYEE_THRESHOLD || '0.85'),
    clientNameThreshold: parseFloat(process.env.VITE_FUZZY_CLIENT_THRESHOLD || '0.80'),
    enablePartialMatching: process.env.VITE_FUZZY_PARTIAL_MATCH === 'true' || true,
  },

  // Compliance & Limits
  limits: {
    maxDocumentSize: parseInt(process.env.VITE_MIGRATION_MAX_SIZE || '52428800', 10), // 50MB default
    maxRecordsPerDocument: parseInt(process.env.VITE_MIGRATION_MAX_RECORDS || '1000', 10),
    extractionCooldownSeconds: parseInt(process.env.VITE_MIGRATION_COOLDOWN || '5', 10),
  },
};

export default migrationConfig;
