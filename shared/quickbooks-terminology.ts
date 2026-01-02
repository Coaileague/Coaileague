/**
 * QuickBooks DNA Alignment - Terminology Mapping
 * 
 * This configuration ensures CoAIleague feels native to QuickBooks users
 * by using QB terminology in the UI while maintaining our internal data structure.
 * 
 * QB Data Hierarchy:
 *   Customer → Job → Invoice → Line Item
 * 
 * CoAIleague Mapping:
 *   Client → Site/Contract → Invoice → Shift/Service Line
 */

export const QB_TERMINOLOGY = {
  // Entity mappings (CoAIleague internal → QuickBooks display)
  entities: {
    client: 'Customer',
    clients: 'Customers',
    employee: 'Employee',
    employees: 'Employees',
    site: 'Job',
    sites: 'Jobs',
    contract: 'Job',
    contracts: 'Jobs',
    shift: 'Time Activity',
    shifts: 'Time Activities',
    invoice: 'Invoice',
    invoices: 'Invoices',
    service: 'Service Item',
    services: 'Service Items',
    position: 'Service Item',
    positions: 'Service Items',
    payroll: 'Payroll',
    payrollRun: 'Payroll Run',
    timeEntry: 'Time Activity',
    timeEntries: 'Time Activities',
  },

  // Action mappings
  actions: {
    createClient: 'Create Customer',
    editClient: 'Edit Customer',
    deleteClient: 'Delete Customer',
    createShift: 'Create Time Activity',
    assignGuard: 'Assign Employee',
    clockIn: 'Start Time',
    clockOut: 'Stop Time',
    generateInvoice: 'Create Invoice',
    sendInvoice: 'Send Invoice',
    processPayroll: 'Run Payroll',
    approveTimesheet: 'Approve Time Activities',
  },

  // Field mappings
  fields: {
    clientName: 'Customer Name',
    clientId: 'Customer ID',
    contactEmail: 'Email',
    contactPhone: 'Phone',
    billingAddress: 'Billing Address',
    serviceAddress: 'Job Location',
    hourlyRate: 'Hourly Rate',
    billRate: 'Bill Rate',
    payRate: 'Pay Rate',
    totalHours: 'Total Hours',
    totalAmount: 'Amount',
    dueDate: 'Due Date',
    invoiceNumber: 'Invoice No.',
    poNumber: 'P.O. Number',
    terms: 'Terms',
  },

  // Status mappings
  statuses: {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
    approved: 'Approved',
    paid: 'Paid',
    overdue: 'Overdue',
    draft: 'Draft',
    sent: 'Sent',
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Voided',
  },

  // Report mappings (CoAIleague reports → QB report equivalents)
  reports: {
    timesheet: 'Time Activities by Employee Detail',
    invoiceSummary: 'Invoice List',
    payrollSummary: 'Payroll Summary',
    customerBalance: 'Customer Balance Summary',
    profitLoss: 'Profit & Loss',
    aging: 'A/R Aging Summary',
    employeeEarnings: 'Employee Earnings Summary',
  },

  // Navigation/Menu items
  navigation: {
    clients: 'Customers',
    clientPortal: 'Customer Center',
    employees: 'Employees',
    scheduling: 'Time Activities',
    invoicing: 'Invoicing',
    payroll: 'Payroll',
    reports: 'Reports',
    settings: 'Settings',
  },
} as const;

/**
 * QuickBooks Data Hierarchy Mapping
 * 
 * This documents how CoAIleague's data structure maps to QuickBooks:
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ QuickBooks Structure    │  CoAIleague Equivalent               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ Customer                │  Client (organization we bill)       │
 * │   └── Job               │  Site/Contract (specific location)   │
 * │         └── Invoice     │  Invoice (billing document)          │
 * │              └── Line   │  Shift hours as billable line item   │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ Employee                │  Employee (guard/worker)             │
 * │   └── Time Activity     │  Time Entry (clock in/out record)    │
 * │   └── Paycheck          │  Payroll item                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ Service Item            │  Position/Service Type               │
 * │   (hourly security)     │  (Security Guard, Supervisor, etc.)  │
 * └─────────────────────────────────────────────────────────────────┘
 */

export const QB_HIERARCHY = {
  customer: {
    qbEntity: 'Customer',
    coaEntity: 'Client',
    qbId: 'Id',
    coaId: 'quickbooksCustomerId',
    children: ['Job'],
  },
  job: {
    qbEntity: 'Job (sub-customer)',
    coaEntity: 'Site/Contract',
    qbId: 'Id',
    coaId: 'quickbooksJobId',
    parent: 'Customer',
    children: ['Invoice'],
  },
  invoice: {
    qbEntity: 'Invoice',
    coaEntity: 'Invoice',
    qbId: 'Id',
    coaId: 'quickbooksInvoiceId',
    parent: 'Customer',
    children: ['Line'],
  },
  line: {
    qbEntity: 'SalesItemLine',
    coaEntity: 'InvoiceLineItem (from Shift)',
    parent: 'Invoice',
    fields: {
      description: 'Shift details (date, hours, guard name)',
      amount: 'hours × billRate',
      serviceItem: 'Position/Service type',
    },
  },
  employee: {
    qbEntity: 'Employee',
    coaEntity: 'Employee',
    qbId: 'Id',
    coaId: 'quickbooksEmployeeId',
    children: ['TimeActivity', 'Paycheck'],
  },
  timeActivity: {
    qbEntity: 'TimeActivity',
    coaEntity: 'TimeEntry (clock in/out)',
    qbId: 'Id',
    coaId: 'quickbooksTimeActivityId',
    parent: 'Employee',
    fields: {
      hours: 'Duration from clock in to clock out',
      billableStatus: 'Billable (linked to customer)',
      description: 'Shift notes, patrol logs',
    },
  },
  serviceItem: {
    qbEntity: 'Item (Service type)',
    coaEntity: 'Position',
    qbId: 'Id',
    coaId: 'quickbooksItemId',
    examples: ['Security Guard', 'Armed Guard', 'Supervisor', 'Event Security'],
  },
} as const;

/**
 * QB Action Equivalents
 * Every CoAIleague action that should sync to QuickBooks
 */
export const QB_ACTION_SYNC = {
  // Time Tracking
  clockIn: {
    qbAction: 'Create TimeActivity',
    qbEndpoint: '/v3/company/{realmId}/timeactivity',
    method: 'POST',
    description: 'When guard clocks in, create QB time activity (in progress)',
  },
  clockOut: {
    qbAction: 'Update TimeActivity',
    qbEndpoint: '/v3/company/{realmId}/timeactivity',
    method: 'POST',
    description: 'When guard clocks out, update QB time activity with end time',
  },
  
  // Invoicing
  generateInvoice: {
    qbAction: 'Create Invoice',
    qbEndpoint: '/v3/company/{realmId}/invoice',
    method: 'POST',
    description: 'Create QB invoice from approved time entries',
  },
  sendInvoice: {
    qbAction: 'Send Invoice',
    qbEndpoint: '/v3/company/{realmId}/invoice/{invoiceId}/send',
    method: 'POST',
    description: 'Email invoice to customer via QB',
  },
  recordPayment: {
    qbAction: 'Create Payment',
    qbEndpoint: '/v3/company/{realmId}/payment',
    method: 'POST',
    description: 'Record payment received against invoice',
  },

  // Employee Management
  createEmployee: {
    qbAction: 'Create Employee',
    qbEndpoint: '/v3/company/{realmId}/employee',
    method: 'POST',
    description: 'Sync new employee to QB (for payroll)',
  },
  updateEmployee: {
    qbAction: 'Update Employee',
    qbEndpoint: '/v3/company/{realmId}/employee',
    method: 'POST',
    description: 'Sync employee changes to QB',
  },

  // Customer Management
  createClient: {
    qbAction: 'Create Customer',
    qbEndpoint: '/v3/company/{realmId}/customer',
    method: 'POST',
    description: 'Create customer in QB when client added',
  },
  updateClient: {
    qbAction: 'Update Customer',
    qbEndpoint: '/v3/company/{realmId}/customer',
    method: 'POST',
    description: 'Sync client changes to QB',
  },

  // Reporting (read operations)
  generateTimesheet: {
    qbAction: 'Query TimeActivities',
    qbEndpoint: '/v3/company/{realmId}/query',
    method: 'GET',
    description: 'Pull time data for report reconciliation',
  },
  generateProfitLoss: {
    qbAction: 'Run Profit & Loss Report',
    qbEndpoint: '/v3/company/{realmId}/reports/ProfitAndLoss',
    method: 'GET',
    description: 'Fetch P&L for financial dashboard',
  },
} as const;

/**
 * Helper function to get QB terminology for display
 */
export function getQBTerm(key: keyof typeof QB_TERMINOLOGY.entities): string {
  return QB_TERMINOLOGY.entities[key] || key;
}

/**
 * Helper function to get QB action label
 */
export function getQBAction(key: keyof typeof QB_TERMINOLOGY.actions): string {
  return QB_TERMINOLOGY.actions[key] || key;
}

/**
 * Helper function to get QB field label
 */
export function getQBField(key: keyof typeof QB_TERMINOLOGY.fields): string {
  return QB_TERMINOLOGY.fields[key] || key;
}

/**
 * Helper function to get QB status label
 */
export function getQBStatus(key: keyof typeof QB_TERMINOLOGY.statuses): string {
  return QB_TERMINOLOGY.statuses[key] || key;
}
