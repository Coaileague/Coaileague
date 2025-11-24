/**
 * Payroll Deductions & Garnishments Configuration
 * 
 * Universal dynamic configuration for all payroll-related settings.
 * Zero hardcoded values - everything is configurable from this single source.
 */

export const deductionTypesConfig = {
  health_insurance: {
    label: 'Health Insurance',
    category: 'Insurance',
    defaultPreTax: true,
  },
  dental: {
    label: 'Dental Insurance',
    category: 'Insurance',
    defaultPreTax: true,
  },
  vision: {
    label: 'Vision Insurance',
    category: 'Insurance',
    defaultPreTax: true,
  },
  ira: {
    label: 'IRA Contribution',
    category: 'Retirement',
    defaultPreTax: true,
  },
  '401k': {
    label: '401(k) Contribution',
    category: 'Retirement',
    defaultPreTax: true,
  },
  hsa: {
    label: 'HSA Contribution',
    category: 'Health Savings',
    defaultPreTax: true,
  },
  fsa: {
    label: 'FSA Contribution',
    category: 'Health Savings',
    defaultPreTax: true,
  },
  other: {
    label: 'Other Deduction',
    category: 'Other',
    defaultPreTax: false,
  },
} as const;

export const garnishmentTypesConfig = {
  child_support: {
    label: 'Child Support',
    priority: 1,
    description: 'Court-ordered child support garnishment',
  },
  alimony: {
    label: 'Alimony',
    priority: 1,
    description: 'Court-ordered alimony/spousal support',
  },
  taxes: {
    label: 'Tax Garnishment',
    priority: 1,
    description: 'Federal/state tax garnishment',
  },
  student_loans: {
    label: 'Student Loans',
    priority: 3,
    description: 'Student loan garnishment',
  },
  court_order: {
    label: 'Court Order',
    priority: 2,
    description: 'General court-ordered garnishment',
  },
  other: {
    label: 'Other Garnishment',
    priority: 4,
    description: 'Other garnishment type',
  },
} as const;

export const priorityConfig = {
  1: {
    label: 'Critical (Federal Taxes, Child Support)',
    description: 'Deducted first - legal compliance required',
    severity: 'critical',
  },
  2: {
    label: 'High (Alimony, Court Orders)',
    description: 'Deducted second - court-mandated',
    severity: 'high',
  },
  3: {
    label: 'Normal (Student Loans)',
    description: 'Deducted third - standard garnishments',
    severity: 'normal',
  },
  4: {
    label: 'Low (Other)',
    description: 'Deducted last - lowest priority',
    severity: 'low',
  },
} as const;

export const payrollMessages = {
  deductions: {
    title: 'Payroll Deductions',
    description: 'Manage employee pre-tax and post-tax deductions',
    addButton: 'Add Deduction',
    addDialogTitle: 'Add Payroll Deduction',
    addDialogDescription: 'Create a new deduction for an employee\'s payroll entry',
    deleteConfirm: 'Deduction removed successfully',
    deleteError: 'Failed to delete deduction',
    addSuccess: 'Deduction added successfully',
    addError: 'Failed to add deduction',
    noDeductions: 'No deductions found',
    preTaxLabel: 'Pre-Tax Deduction',
    preTaxDescription: 'Deduct before calculating taxes',
  },
  garnishments: {
    title: 'Payroll Garnishments',
    description: 'Manage court-ordered wage garnishments (child support, alimony, taxes)',
    addButton: 'Add Garnishment',
    addDialogTitle: 'Add Payroll Garnishment',
    addDialogDescription: 'Create a court-ordered wage garnishment. Higher priority garnishments are deducted first.',
    deleteConfirm: 'Garnishment removed successfully',
    deleteError: 'Failed to delete garnishment',
    addSuccess: 'Garnishment added successfully',
    addError: 'Failed to add garnishment',
    noGarnishments: 'No garnishments on file',
    complianceWarning: 'Legal Compliance Notice',
    complianceText: 'Garnishments are processed in priority order. Failure to comply with court orders may result in penalties.',
  },
};

export const payrollValidation = {
  deduction: {
    amountMin: 0.01,
    amountMax: 999999.99,
    descriptionMaxLength: 500,
  },
  garnishment: {
    amountMin: 0.01,
    amountMax: 999999.99,
    priorityMin: 1,
    priorityMax: 4,
    caseNumberMaxLength: 100,
  },
};
