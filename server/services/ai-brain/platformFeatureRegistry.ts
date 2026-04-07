import { createLogger } from '../../lib/logger';
import { EMAIL } from '../../config/platformConfig';
const log = createLogger('platformFeatureRegistry');

/**
 * PLATFORM FEATURE REGISTRY
 * ==========================
 * Comprehensive catalog of all CoAIleague platform features
 * Used by AI Brain for contextual help and support agent assistance
 */

export interface FeatureCapability {
  name: string;
  description: string;
  howTo?: string;
  troubleshooting?: string[];
  relatedFeatures?: string[];
  apiEndpoints?: string[];
  requiredTier?: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
}

export interface PlatformFeature {
  id: string;
  name: string;
  category: FeatureCategory;
  description: string;
  icon: string;
  capabilities: FeatureCapability[];
  commonIssues: CommonIssue[];
  keywords: string[];
  helpDocs?: string;
  requiredTier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic';
  enabled: boolean;
}

export interface CommonIssue {
  issue: string;
  symptoms: string[];
  solution: string;
  preventiveMeasures?: string[];
}

export type FeatureCategory = 
  | 'time_tracking'
  | 'scheduling'
  | 'invoicing'
  | 'availability'
  | 'notifications'
  | 'calendar'
  | 'analytics'
  | 'breaks'
  | 'employees'
  | 'clients'
  | 'reports'
  | 'payroll'
  | 'compliance'
  | 'communication'
  | 'ai_features'
  | 'integrations';

export const PLATFORM_FEATURES: PlatformFeature[] = [
  // ============================================================================
  // TIME TRACKING (TimeOS)
  // ============================================================================
  {
    id: 'time_tracking',
    name: 'Time Tracking',
    category: 'time_tracking',
    description: 'Track employee work hours with clock-in/out, GPS verification, and automated timesheet generation',
    icon: 'Clock',
    requiredTier: 'free',
    enabled: true,
    keywords: ['clock', 'time', 'hours', 'punch', 'timesheet', 'clock in', 'clock out', 'work hours'],
    capabilities: [
      {
        name: 'Clock In/Out',
        description: 'Employees can clock in and out with optional GPS location verification',
        howTo: 'Navigate to Time Tracking page, click the "Clock In" button. For clock out, click "Clock Out". GPS will auto-capture if enabled.',
        troubleshooting: [
          'If clock button is disabled, ensure you have an active shift assigned',
          'GPS issues may occur if location services are disabled in browser',
          'Check if you already have an open time entry that needs to be closed'
        ],
        apiEndpoints: ['/api/hr/time-entries/clock-in', '/api/hr/time-entries/clock-out']
      },
      {
        name: 'Timesheets',
        description: 'View and manage detailed timesheets with hours worked, breaks, and overtime',
        howTo: 'Go to Time Tracking > Timesheets. Select date range to view. Export to PDF or CSV using the export button.',
        troubleshooting: [
          'Missing hours may indicate unclosed time entries',
          'Overtime calculation based on workspace settings (default 40 hrs/week)',
          'Contact manager if timesheet needs correction'
        ]
      },
      {
        name: 'Time Entry Reports',
        description: 'Generate reports on employee hours, billable time, and productivity',
        howTo: 'Navigate to Reports > Time Reports. Select filters and date range, then generate report.',
        requiredTier: 'starter'
      },
      {
        name: 'GPS Verification',
        description: 'Verify employee location when clocking in/out at job sites',
        howTo: 'GPS is automatic when enabled. Admins can set up geofences in Settings > Time Tracking.',
        requiredTier: 'professional',
        troubleshooting: [
          'Enable location permissions in browser settings',
          'Ensure device GPS is turned on',
          'Indoor locations may have reduced accuracy'
        ]
      }
    ],
    commonIssues: [
      {
        issue: 'Cannot clock in',
        symptoms: ['Clock in button disabled', 'Error message when clicking clock in', 'Page not loading'],
        solution: 'Ensure you have an assigned shift for today, check if there is an unclosed time entry, verify your account is active',
        preventiveMeasures: ['Always clock out at end of shift', 'Check schedule before shift starts']
      },
      {
        issue: 'Missing time entries',
        symptoms: ['Hours not appearing on timesheet', 'Gaps in time records'],
        solution: 'Check if entries need manager approval, verify clock out was recorded, contact admin for manual entry if needed'
      },
      {
        issue: 'GPS location incorrect',
        symptoms: ['Wrong location recorded', 'Location shows different address'],
        solution: 'Ensure GPS is enabled, try clocking in outdoors for better signal, refresh location before clocking in'
      }
    ]
  },

  // ============================================================================
  // SCHEDULING (ScheduleOS)
  // ============================================================================
  {
    id: 'scheduling',
    name: 'Scheduling',
    category: 'scheduling',
    description: 'Create, manage, and optimize employee schedules with AI-powered shift generation and swap management',
    icon: 'Calendar',
    requiredTier: 'free',
    enabled: true,
    keywords: ['schedule', 'shift', 'roster', 'work schedule', 'shifts', 'weekly schedule', 'assign', 'swap'],
    capabilities: [
      {
        name: 'Shift Creation',
        description: 'Create individual or recurring shifts for employees',
        howTo: 'Go to Schedule page, click on a time slot or use "Add Shift" button. Fill in employee, time, and location details.',
        troubleshooting: [
          'If employee not showing, verify they are active and have the required role',
          'Time conflicts will be highlighted in red',
          'Ensure client/location exists before assigning'
        ]
      },
      {
        name: 'Recurring Shifts',
        description: 'Set up shifts that repeat daily, weekly, or on custom schedules',
        howTo: 'When creating a shift, enable "Recurring" toggle. Select frequency (daily, weekly, bi-weekly, monthly) and end date.',
        requiredTier: 'starter',
        relatedFeatures: ['shift_templates']
      },
      {
        name: 'Shift Swap Requests',
        description: 'Employees can request to swap shifts with colleagues',
        howTo: 'From My Schedule, click on a shift and select "Request Swap". Choose an eligible colleague. Both parties must approve.',
        troubleshooting: [
          'Swaps require both employees to have matching qualifications',
          'Manager approval may be required based on settings',
          'Check notification settings if not receiving swap requests'
        ]
      },
      {
        name: 'Shift Duplication',
        description: 'Quickly duplicate existing shifts or entire week schedules',
        howTo: 'Select a shift, click "Duplicate". Choose target date(s). For weekly duplication, use "Copy Week" button.',
        requiredTier: 'starter'
      },
      {
        name: 'AI Schedule Generation',
        description: 'Let AI automatically generate optimized schedules based on employee availability and preferences',
        howTo: 'Go to Schedule > AI Assistant. Set parameters like date range, required coverage. Click "Generate Schedule" for AI recommendations.',
        requiredTier: 'professional',
        relatedFeatures: ['availability', 'employee_preferences']
      },
      {
        name: 'Open Shifts',
        description: 'Post shifts that any qualified employee can claim',
        howTo: 'When creating shift, leave employee blank and enable "Open Shift". Employees can claim from their dashboard.',
        troubleshooting: [
          'Only employees with matching roles/qualifications see open shifts',
          'Set auto-assign rules for first-come-first-served'
        ]
      }
    ],
    commonIssues: [
      {
        issue: 'Schedule not showing shifts',
        symptoms: ['Empty calendar', 'Shifts created but not visible'],
        solution: 'Check date filter is correct, ensure you have permission to view schedule, verify shifts are published (not draft)'
      },
      {
        issue: 'Cannot assign employee to shift',
        symptoms: ['Employee not in dropdown', 'Error when saving shift'],
        solution: 'Verify employee is active, check availability conflicts, ensure employee has required certifications for the role'
      },
      {
        issue: 'Recurring shifts not generating',
        symptoms: ['Only first instance created', 'Missing future shifts'],
        solution: 'Check end date for recurrence, verify no date conflicts, regenerate series if needed'
      }
    ]
  },

  // ============================================================================
  // INVOICING (BillOS)
  // ============================================================================
  {
    id: 'invoicing',
    name: 'Invoicing',
    category: 'invoicing',
    description: 'Generate invoices from tracked hours, send to clients, and manage payments',
    icon: 'FileText',
    requiredTier: 'starter',
    enabled: true,
    keywords: ['invoice', 'bill', 'billing', 'payment', 'client billing', 'hours to invoice', 'send invoice'],
    capabilities: [
      {
        name: 'Generate from Hours',
        description: 'Automatically create invoices from approved timesheet entries',
        howTo: 'Go to Invoicing > Create Invoice. Select client and date range. System will pull approved hours automatically. Review and confirm.',
        troubleshooting: [
          'Only approved time entries appear',
          'Verify employee hourly rates are set',
          'Check billable flag on time entries'
        ]
      },
      {
        name: 'Email Invoices',
        description: 'Send invoices directly to clients via email with PDF attachment',
        howTo: 'Open invoice, click "Send Email". Add recipient email, optional message. Invoice PDF is attached automatically.',
        relatedFeatures: ['email_templates']
      },
      {
        name: 'PDF Export',
        description: 'Download professional PDF invoices with company branding',
        howTo: 'Click "Download PDF" on any invoice. Customize logo and colors in Settings > Invoice Settings.',
        troubleshooting: [
          'If PDF fails, check browser allows downloads',
          'Large invoices may take a moment to generate'
        ]
      },
      {
        name: 'Payment Tracking',
        description: 'Track invoice status and record payments received',
        howTo: 'Update invoice status manually or connect Stripe for automatic payment tracking.',
        requiredTier: 'professional',
        relatedFeatures: ['stripe_integration']
      },
      {
        name: 'Invoice Adjustments',
        description: 'Apply credits, discounts, or corrections to existing invoices',
        howTo: 'Open invoice, click "Adjust". Select adjustment type (credit, discount, refund). Enter amount and reason.'
      }
    ],
    commonIssues: [
      {
        issue: 'Hours not appearing on invoice',
        symptoms: ['Invoice total is $0', 'Time entries missing'],
        solution: 'Ensure time entries are approved, verify billable flag is set, check date range matches time entries'
      },
      {
        issue: 'Client not receiving invoice email',
        symptoms: ['Email not delivered', 'Client says no email received'],
        solution: 'Verify client email address, check spam folder, resend from invoice page, verify email service is configured'
      },
      {
        issue: 'PDF generation fails',
        symptoms: ['Download button not working', 'Error when generating PDF'],
        solution: 'Refresh page and try again, ensure all required invoice fields are filled, contact support if persists'
      }
    ]
  },

  // ============================================================================
  // AVAILABILITY
  // ============================================================================
  {
    id: 'availability',
    name: 'Availability',
    category: 'availability',
    description: 'Manage employee availability preferences and exceptions for scheduling',
    icon: 'UserCheck',
    requiredTier: 'free',
    enabled: true,
    keywords: ['availability', 'available', 'unavailable', 'time off', 'preferences', 'when can work'],
    capabilities: [
      {
        name: 'Submit Availability',
        description: 'Set your regular weekly availability for scheduling',
        howTo: 'Go to Availability page. Click on time slots to mark as available (green) or unavailable (red). Save changes.',
        troubleshooting: [
          'Changes may take effect on next schedule generation',
          'Manager must approve availability changes in some workspaces'
        ]
      },
      {
        name: 'Availability Exceptions',
        description: 'Set one-time or temporary availability changes (vacation, appointments)',
        howTo: 'Click "Add Exception" on Availability page. Select date(s), mark as unavailable, add optional note. Submit for approval.',
        relatedFeatures: ['pto_requests']
      },
      {
        name: 'Team Availability View',
        description: 'Managers can view all team members availability at once',
        howTo: 'Go to Schedule > Team Availability. View color-coded availability across your team.',
        requiredTier: 'starter'
      },
      {
        name: 'Availability Templates',
        description: 'Create reusable availability patterns',
        howTo: 'Set your availability, click "Save as Template". Apply template when availability changes seasonally.',
        requiredTier: 'professional'
      }
    ],
    commonIssues: [
      {
        issue: 'Availability not showing in schedule',
        symptoms: ['Scheduled during unavailable time', 'Manager cannot see availability'],
        solution: 'Ensure availability is saved and approved, check effective date, verify no conflicting exceptions'
      },
      {
        issue: 'Cannot update availability',
        symptoms: ['Save button disabled', 'Error when saving'],
        solution: 'Check if within edit window (usually 2 weeks ahead), contact manager for emergency changes'
      }
    ]
  },

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================
  {
    id: 'notifications',
    name: 'Notifications',
    category: 'notifications',
    description: 'Receive alerts via SMS, email, and in-app for schedule changes, reminders, and updates',
    icon: 'Bell',
    requiredTier: 'free',
    enabled: true,
    keywords: ['notification', 'alert', 'remind', 'reminder', 'sms', 'email', 'text message', 'notify'],
    capabilities: [
      {
        name: 'SMS Notifications',
        description: 'Receive text message alerts for shift reminders, schedule changes, and urgent updates',
        howTo: 'Go to Settings > Notifications. Enable SMS and verify your phone number. Select which notifications to receive.',
        requiredTier: 'starter',
        troubleshooting: [
          'Verify phone number format includes country code',
          'Check if SMS quota is not exceeded (workspace limits apply)',
          'Ensure number can receive SMS (not landline)'
        ]
      },
      {
        name: 'Email Notifications',
        description: 'Receive email updates for schedules, invoices, reports, and system alerts',
        howTo: 'Configure in Settings > Notifications. Select email preferences for each notification type.',
        troubleshooting: [
          'Check spam/junk folder',
          `Whitelist ${EMAIL.senders.noreply}`,
          'Verify email address is correct'
        ]
      },
      {
        name: 'Shift Reminders',
        description: 'Automatic reminders before shifts start',
        howTo: 'Managers set reminder timing in Workspace Settings. Employees receive reminders via their preferred channel.',
        relatedFeatures: ['scheduling']
      },
      {
        name: 'Notification Preferences',
        description: 'Customize which notifications you receive and how',
        howTo: 'Go to Profile > Notification Preferences. Toggle each notification type on/off. Set quiet hours if needed.'
      }
    ],
    commonIssues: [
      {
        issue: 'Not receiving notifications',
        symptoms: ['Missing shift reminders', 'No email/SMS alerts'],
        solution: 'Check notification settings are enabled, verify contact info is correct, check spam folder for emails'
      },
      {
        issue: 'Too many notifications',
        symptoms: ['Overwhelmed by alerts', 'Duplicate notifications'],
        solution: 'Adjust notification preferences, set quiet hours, disable low-priority notifications'
      }
    ]
  },

  // ============================================================================
  // CALENDAR
  // ============================================================================
  {
    id: 'calendar',
    name: 'Calendar Integration',
    category: 'calendar',
    description: 'Sync schedules with external calendars via iCal export/import and subscriptions',
    icon: 'CalendarDays',
    requiredTier: 'free',
    enabled: true,
    keywords: ['calendar', 'ical', 'google calendar', 'outlook', 'sync', 'export calendar', 'subscribe'],
    capabilities: [
      {
        name: 'iCal Export',
        description: 'Export your schedule as an iCal file for import into any calendar app',
        howTo: 'Go to My Schedule. Click "Export" > "Download iCal". Import the .ics file into Google Calendar, Outlook, or Apple Calendar.',
        troubleshooting: [
          'If events dont appear, try re-importing the file',
          'Some calendar apps may require refresh to show new events'
        ]
      },
      {
        name: 'Calendar Subscription',
        description: 'Subscribe to a live calendar feed that auto-updates with schedule changes',
        howTo: 'Go to My Schedule > Calendar Settings. Copy subscription URL. In your calendar app, add as "Subscribe to Calendar".',
        troubleshooting: [
          'Subscription updates every 15-30 minutes',
          'Use the subscription URL, not download link',
          'Private URL - do not share with others'
        ],
        relatedFeatures: ['scheduling']
      },
      {
        name: 'External Calendar Import',
        description: 'Import events from external calendars to block availability',
        howTo: 'In Availability settings, add external calendar URL. Events will show as busy time when scheduling.',
        requiredTier: 'professional'
      }
    ],
    commonIssues: [
      {
        issue: 'Calendar not syncing',
        symptoms: ['Old shifts still showing', 'New shifts not appearing'],
        solution: 'Wait for sync interval (15-30 min), manually refresh subscription in calendar app, re-subscribe if needed'
      },
      {
        issue: 'Wrong time zone in calendar',
        symptoms: ['Shifts show at wrong time', 'Time offset issues'],
        solution: 'Check time zone settings in both CoAIleague and calendar app, ensure they match'
      }
    ]
  },

  // ============================================================================
  // ANALYTICS
  // ============================================================================
  {
    id: 'analytics',
    name: 'Analytics & Insights',
    category: 'analytics',
    description: 'View dashboards, heat maps, and AI-powered insights about workforce performance',
    icon: 'BarChart',
    requiredTier: 'starter',
    enabled: true,
    keywords: ['analytics', 'dashboard', 'reports', 'insights', 'metrics', 'kpi', 'performance', 'heat map'],
    capabilities: [
      {
        name: 'Analytics Dashboard',
        description: 'Overview of key metrics including hours worked, revenue, and employee performance',
        howTo: 'Navigate to Analytics from sidebar. Dashboard shows real-time metrics. Use filters to narrow by date, team, or client.',
        relatedFeatures: ['reports']
      },
      {
        name: 'Scheduling Heat Map',
        description: 'Visual representation of schedule density and coverage gaps',
        howTo: 'Go to Analytics > Schedule Heat Map. Colors indicate coverage levels. Click on time slots for details.',
        requiredTier: 'professional'
      },
      {
        name: 'AI Insights',
        description: 'AI-generated recommendations for improving operations, reducing costs, and optimizing schedules',
        howTo: 'Access from Analytics > AI Insights. View automated recommendations. Click "Apply" to implement suggestions.',
        requiredTier: 'professional',
        relatedFeatures: ['ai_features']
      },
      {
        name: 'Custom Reports',
        description: 'Build and save custom reports with specific metrics and filters',
        howTo: 'Go to Reports > Create Custom Report. Select metrics, filters, and visualization type. Save for future use.',
        requiredTier: 'enterprise'
      }
    ],
    commonIssues: [
      {
        issue: 'Dashboard data not loading',
        symptoms: ['Blank dashboard', 'Loading forever', 'Metrics show 0'],
        solution: 'Refresh the page, check date filter, ensure data exists for selected period'
      },
      {
        issue: 'Incorrect metrics displayed',
        symptoms: ['Numbers dont match expectations', 'Missing data'],
        solution: 'Verify date range is correct, check if all time entries are approved, data syncs hourly'
      }
    ]
  },

  // ============================================================================
  // BREAKS COMPLIANCE
  // ============================================================================
  {
    id: 'breaks',
    name: 'Breaks & Compliance',
    category: 'breaks',
    description: 'Manage meal and rest breaks with automatic scheduling and labor law compliance',
    icon: 'Coffee',
    requiredTier: 'starter',
    enabled: true,
    keywords: ['break', 'lunch', 'meal break', 'rest break', 'compliance', 'labor law', 'mandatory break'],
    capabilities: [
      {
        name: 'Break Compliance Tracking',
        description: 'Track meal and rest breaks to ensure labor law compliance',
        howTo: 'Breaks are tracked automatically with time entries. View compliance status in Time Tracking > Breaks.',
        troubleshooting: [
          'Compliance rules based on workspace location/state',
          'Configure custom rules in Settings > Compliance'
        ]
      },
      {
        name: 'Auto-Scheduled Breaks',
        description: 'Automatically schedule required breaks based on shift length',
        howTo: 'Enable in Settings > Breaks. Set rules for break timing based on hours worked. Breaks auto-added to schedules.',
        requiredTier: 'professional'
      },
      {
        name: 'Break Reminders',
        description: 'Notify employees when its time to take required breaks',
        howTo: 'Configure in Settings > Notifications. Enable break reminders with timing preferences.'
      },
      {
        name: 'Compliance Reports',
        description: 'Generate reports showing break compliance across the organization',
        howTo: 'Go to Reports > Compliance. Select date range and view break compliance metrics.',
        requiredTier: 'professional'
      }
    ],
    commonIssues: [
      {
        issue: 'Break not recorded',
        symptoms: ['Missing break on timesheet', 'Compliance warning'],
        solution: 'Manually add break if missed, contact manager to edit time entry'
      },
      {
        issue: 'Compliance violation alert',
        symptoms: ['Warning notification', 'Red flag on employee record'],
        solution: 'Review time entry for the day, ensure breaks were taken as required, document any waived breaks'
      }
    ]
  },

  // ============================================================================
  // EMPLOYEES
  // ============================================================================
  {
    id: 'employees',
    name: 'Employee Management',
    category: 'employees',
    description: 'Manage employee profiles, roles, permissions, and organizational hierarchy',
    icon: 'Users',
    requiredTier: 'free',
    enabled: true,
    keywords: ['employee', 'staff', 'worker', 'team', 'hire', 'onboard', 'role', 'permission'],
    capabilities: [
      {
        name: 'Employee Profiles',
        description: 'Manage employee information, contact details, and employment records',
        howTo: 'Navigate to Employees. Click on employee to view/edit profile. Update contact info, certifications, and notes.'
      },
      {
        name: 'Role & Permissions',
        description: 'Assign roles and customize what employees can access',
        howTo: 'In employee profile, go to Access tab. Assign role (Employee, Manager, Admin). Custom permissions in Settings.',
        requiredTier: 'starter'
      },
      {
        name: 'Onboarding',
        description: 'Streamlined onboarding process for new employees',
        howTo: 'Go to Employees > Add Employee. Follow onboarding wizard. Send invite to new employee for account setup.',
        relatedFeatures: ['notifications']
      },
      {
        name: 'Document Storage',
        description: 'Store employee documents like certifications, contracts, and ID',
        howTo: 'In employee profile, use Documents tab. Upload files with category and expiration date tracking.',
        requiredTier: 'professional'
      }
    ],
    commonIssues: [
      {
        issue: 'Employee cannot login',
        symptoms: ['Login failed', 'Account not found', 'Password reset not working'],
        solution: 'Verify employee account is active, check email address is correct, resend invite if needed'
      },
      {
        issue: 'Permission denied errors',
        symptoms: ['Cannot access feature', 'Forbidden message'],
        solution: 'Check employee role has required permissions, contact admin to adjust access'
      }
    ]
  },

  // ============================================================================
  // CLIENTS
  // ============================================================================
  {
    id: 'clients',
    name: 'Client Management',
    category: 'clients',
    description: 'Manage client accounts, locations, and billing configurations',
    icon: 'Building',
    requiredTier: 'free',
    enabled: true,
    keywords: ['client', 'customer', 'account', 'location', 'site', 'billing rate'],
    capabilities: [
      {
        name: 'Client Profiles',
        description: 'Manage client information, contacts, and billing details',
        howTo: 'Go to Clients. Add new or edit existing. Set billing rates, payment terms, and contact info.'
      },
      {
        name: 'Multiple Locations',
        description: 'Configure multiple work locations per client',
        howTo: 'In client profile, go to Locations tab. Add addresses with geofence radius for GPS tracking.',
        relatedFeatures: ['time_tracking']
      },
      {
        name: 'Custom Billing Rates',
        description: 'Set different hourly rates per client, service type, or employee level',
        howTo: 'In client settings, configure billing rates. Override default rates for specific employees or services.',
        requiredTier: 'starter'
      }
    ],
    commonIssues: [
      {
        issue: 'Cannot create invoice for client',
        symptoms: ['Client not in dropdown', 'Billing rate shows $0'],
        solution: 'Ensure client has billing enabled, verify billing rates are configured, check client is active'
      }
    ]
  },

  // ============================================================================
  // REPORTS
  // ============================================================================
  {
    id: 'reports',
    name: 'Reports',
    category: 'reports',
    description: 'Generate comprehensive reports for payroll, billing, compliance, and operations',
    icon: 'FileBarChart',
    requiredTier: 'starter',
    enabled: true,
    keywords: ['report', 'export', 'payroll report', 'billing report', 'timesheet report', 'summary'],
    capabilities: [
      {
        name: 'Payroll Reports',
        description: 'Generate reports for payroll processing with hours, overtime, and deductions',
        howTo: 'Go to Reports > Payroll. Select pay period and employees. Export to CSV for payroll processing.'
      },
      {
        name: 'Client Billing Reports',
        description: 'Detailed breakdown of billable hours per client',
        howTo: 'Reports > Billing. Select client and date range. View summary or detailed breakdown.'
      },
      {
        name: 'Scheduled Reports',
        description: 'Automatically generate and email reports on a schedule',
        howTo: 'When viewing a report, click "Schedule". Set frequency and recipients. Reports auto-delivered.',
        requiredTier: 'professional'
      },
      {
        name: 'Export to Excel/PDF',
        description: 'Export any report to Excel or PDF format',
        howTo: 'Click export button on any report. Choose format (Excel, PDF, CSV). Download starts automatically.'
      }
    ],
    commonIssues: [
      {
        issue: 'Report shows no data',
        symptoms: ['Empty report', 'All zeros'],
        solution: 'Check date range filter, ensure data exists for period, verify you have permission to view the data'
      }
    ]
  },

  // ============================================================================
  // PAYROLL
  // ============================================================================
  {
    id: 'payroll',
    name: 'Payroll',
    category: 'payroll',
    description: 'Process payroll with automated calculations, tax handling, and integrations',
    icon: 'DollarSign',
    requiredTier: 'professional',
    enabled: true,
    keywords: ['payroll', 'pay', 'wages', 'salary', 'overtime', 'tax', 'deduction'],
    capabilities: [
      {
        name: 'Payroll Processing',
        description: 'Calculate and process employee payroll from time entries',
        howTo: 'Go to Payroll. Select pay period. Review calculated amounts. Approve and process.',
        relatedFeatures: ['time_tracking']
      },
      {
        name: 'Tax Calculations',
        description: 'Automatic federal, state, and local tax calculations',
        howTo: 'Tax rates configured in Settings > Payroll. Employee tax info in their profile.'
      },
      {
        name: 'Deductions & Garnishments',
        description: 'Manage recurring deductions and court-ordered garnishments',
        howTo: 'Add deductions in employee profile > Payroll tab. Set amount, type, and frequency.'
      },
      {
        name: 'Payroll Integration',
        description: 'Sync with external payroll providers (Gusto, QuickBooks)',
        howTo: 'Settings > Integrations. Connect your payroll provider. Map employees and sync data.',
        requiredTier: 'enterprise',
        apiEndpoints: ['/api/integrations/gusto', '/api/integrations/quickbooks']
      }
    ],
    commonIssues: [
      {
        issue: 'Overtime not calculating correctly',
        symptoms: ['OT hours wrong', 'Missing overtime pay'],
        solution: 'Check overtime rules in settings, verify weekly hour threshold, review time entries for accuracy'
      }
    ]
  },

  // ============================================================================
  // AI FEATURES
  // ============================================================================
  {
    id: 'ai_features',
    name: 'AI-Powered Features',
    category: 'ai_features',
    description: 'Intelligent automation powered by CoAIleague AI Brain',
    icon: 'Brain',
    requiredTier: 'professional',
    enabled: true,
    keywords: ['ai', 'artificial intelligence', 'automation', 'smart', 'auto', 'predict', 'optimize'],
    capabilities: [
      {
        name: 'AI Schedule Generation',
        description: 'Automatically create optimized schedules based on availability, skills, and preferences',
        howTo: 'Schedule > AI Assistant. Set parameters and constraints. Review AI-generated schedule before applying.',
        requiredTier: 'professional',
        relatedFeatures: ['scheduling', 'availability']
      },
      {
        name: 'Help Desk',
        description: 'AI-powered customer support assistant that learns from interactions',
        howTo: 'Click the chat icon for instant AI assistance. HelpAI can answer questions, troubleshoot issues, and escalate when needed.'
      },
      {
        name: 'Predictive Analytics',
        description: 'AI predictions for staffing needs, no-shows, and overtime',
        howTo: 'View predictions in Analytics > AI Predictions. Use insights for proactive scheduling.',
        requiredTier: 'enterprise'
      },
      {
        name: 'Anomaly Detection',
        description: 'AI monitors for unusual patterns in time entries and schedules',
        howTo: 'Alerts appear in Notifications. Review flagged entries in Analytics > Anomalies.'
      }
    ],
    commonIssues: [
      {
        issue: 'AI suggestions seem incorrect',
        symptoms: ['Poor schedule recommendations', 'Inaccurate predictions'],
        solution: 'AI learns from data - ensure time entries and availability are accurate, provide feedback on AI suggestions'
      }
    ]
  },

  // ============================================================================
  // COMMUNICATION (CommOS)
  // ============================================================================
  {
    id: 'communication',
    name: 'Team Communication',
    category: 'communication',
    description: 'In-app messaging, chat rooms, and team announcements',
    icon: 'MessageSquare',
    requiredTier: 'free',
    enabled: true,
    keywords: ['chat', 'message', 'communicate', 'announcement', 'team chat', 'direct message'],
    capabilities: [
      {
        name: 'Direct Messages',
        description: 'Private messaging between team members',
        howTo: 'Click Messages icon. Start new conversation or select existing. Type message and send.'
      },
      {
        name: 'Chat Rooms',
        description: 'Group chat rooms for teams, projects, or topics',
        howTo: 'Go to Chat. Join existing rooms or create new (managers). Share files and collaborate.'
      },
      {
        name: 'Announcements',
        description: 'Broadcast important messages to all employees',
        howTo: 'Managers: Go to Announcements > Create. Select audience and schedule. Employees see in dashboard.',
        requiredTier: 'starter'
      }
    ],
    commonIssues: [
      {
        issue: 'Not receiving messages',
        symptoms: ['Messages not appearing', 'Missing notifications'],
        solution: 'Check notification settings, ensure browser notifications enabled, try refreshing the page'
      }
    ]
  },

  // ============================================================================
  // QUICKBOOKS INTEGRATION (Jan 2026)
  // ============================================================================
  {
    id: 'quickbooks_integration',
    name: 'QuickBooks Integration',
    category: 'integrations',
    description: 'Full QuickBooks Online/Desktop bidirectional sync with Intuit-compliant rate limiting and token management',
    icon: 'Calculator',
    requiredTier: 'professional',
    enabled: true,
    keywords: ['quickbooks', 'qbo', 'accounting', 'invoices', 'sync', 'intuit', 'migration', 'import'],
    capabilities: [
      {
        name: 'QuickBooks Migration Wizard',
        description: '7-step wizard to import employees, clients, and invoices from QuickBooks',
        howTo: 'Settings > Integrations > QuickBooks > Connect. Follow the 7-step wizard to map fields and import data.',
        apiEndpoints: ['/api/quickbooks/migration', '/api/quickbooks/connect']
      },
      {
        name: 'Invoice Sync',
        description: 'Auto-sync invoices generated in CoAIleague to QuickBooks for unified accounting',
        howTo: 'Invoices created in CoAIleague automatically sync to QuickBooks after generation. Check sync status in Integrations.',
        relatedFeatures: ['invoicing']
      },
      {
        name: 'Rate Limiting & Quota Enforcement',
        description: 'Intuit-compliant per-realm rate limiting (500 req/min production, 100 req/min sandbox) with persisted usage tracking',
        howTo: 'Automatic - Trinity monitors API usage per QuickBooks company. Alerts when approaching limits.',
        requiredTier: 'professional'
      },
      {
        name: 'Proactive Token Refresh',
        description: 'Automatic OAuth token refresh 15 minutes before expiry prevents sync interruptions',
        howTo: 'Automatic - background daemon monitors token expiry and refreshes proactively.'
      },
      {
        name: 'Dynamic OAuth Discovery',
        description: 'Uses Intuit Discovery Document for dynamic OAuth endpoint resolution with 24-hour caching',
        howTo: 'Automatic - ensures compatibility with Intuit API v75+ endpoint changes.'
      }
    ],
    commonIssues: [
      {
        issue: 'QuickBooks sync failing',
        symptoms: ['Invoices not appearing in QB', 'Sync errors', '429 rate limit'],
        solution: 'Check API quota in Trinity diagnostics. Per-realm rate limits are 500/min. Wait for quota reset or contact support for limit increase.'
      },
      {
        issue: 'QuickBooks token expired',
        symptoms: ['Authentication errors', 'Need to reconnect', 'Token invalid'],
        solution: 'Token refresh daemon should handle this automatically. If persisting, go to Settings > Integrations > QuickBooks > Reconnect.'
      }
    ]
  }
];

export class PlatformFeatureRegistry {
  private features: Map<string, PlatformFeature>;

  constructor() {
    this.features = new Map(PLATFORM_FEATURES.map(f => [f.id, f]));
  }

  getFeature(id: string): PlatformFeature | undefined {
    return this.features.get(id);
  }

  getAllFeatures(): PlatformFeature[] {
    return PLATFORM_FEATURES;
  }

  getFeaturesByCategory(category: FeatureCategory): PlatformFeature[] {
    return PLATFORM_FEATURES.filter(f => f.category === category);
  }

  getFeaturesByTier(tier: 'free' | 'trial' | 'starter' | 'professional' | 'business' | 'enterprise' | 'strategic'): PlatformFeature[] {
    const tierOrder = { free: 0, trial: 0, starter: 1, professional: 2, business: 3, enterprise: 4, strategic: 5 };
    return PLATFORM_FEATURES.filter(f => tierOrder[f.requiredTier] <= tierOrder[tier]);
  }

  searchFeatures(query: string): PlatformFeature[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    return PLATFORM_FEATURES
      .map(feature => {
        let score = 0;
        
        if (feature.name.toLowerCase().includes(queryLower)) score += 10;
        if (feature.description.toLowerCase().includes(queryLower)) score += 5;
        
        for (const word of queryWords) {
          if (feature.keywords.some(k => k.includes(word))) score += 3;
          if (feature.capabilities.some(c => c.name.toLowerCase().includes(word))) score += 2;
          if (feature.capabilities.some(c => c.description.toLowerCase().includes(word))) score += 1;
        }

        return { feature, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.feature);
  }

  findCapabilityHelp(query: string): { feature: PlatformFeature; capability: FeatureCapability } | null {
    const queryLower = query.toLowerCase();

    for (const feature of PLATFORM_FEATURES) {
      for (const capability of feature.capabilities) {
        const nameMatch = capability.name.toLowerCase().includes(queryLower);
        const descMatch = capability.description.toLowerCase().includes(queryLower);
        const howToMatch = capability.howTo?.toLowerCase().includes(queryLower);

        if (nameMatch || descMatch || howToMatch) {
          return { feature, capability };
        }
      }
    }

    return null;
  }

  diagnoseIssue(symptoms: string[]): CommonIssue[] {
    const matchingIssues: Array<{ issue: CommonIssue; feature: PlatformFeature; score: number }> = [];
    const symptomsLower = symptoms.map(s => s.toLowerCase());

    for (const feature of PLATFORM_FEATURES) {
      for (const issue of feature.commonIssues) {
        let score = 0;

        for (const symptom of symptomsLower) {
          if (issue.issue.toLowerCase().includes(symptom)) score += 5;
          if (issue.symptoms.some(s => s.toLowerCase().includes(symptom))) score += 3;
          if (issue.solution.toLowerCase().includes(symptom)) score += 1;
        }

        if (score > 0) {
          matchingIssues.push({ issue, feature, score });
        }
      }
    }

    return matchingIssues
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(m => m.issue);
  }

  getFeatureStatus(workspaceSettings: Record<string, boolean>): Array<{ feature: PlatformFeature; enabled: boolean }> {
    return PLATFORM_FEATURES.map(feature => ({
      feature,
      enabled: workspaceSettings[`feature_${feature.id}_enabled`] ?? feature.enabled
    }));
  }

  generateAIContext(): string {
    let context = `# CoAIleague Platform Features Reference\n\n`;
    context += `The CoAIleague platform provides comprehensive workforce management capabilities.\n\n`;

    for (const feature of PLATFORM_FEATURES) {
      context += `## ${feature.name}\n`;
      context += `${feature.description}\n`;
      context += `Required Tier: ${feature.requiredTier}\n\n`;

      context += `### Capabilities:\n`;
      for (const cap of feature.capabilities) {
        context += `- **${cap.name}**: ${cap.description}\n`;
        if (cap.howTo) {
          context += `  How to: ${cap.howTo}\n`;
        }
      }

      if (feature.commonIssues.length > 0) {
        context += `\n### Common Issues:\n`;
        for (const issue of feature.commonIssues) {
          context += `- **${issue.issue}**: ${issue.solution}\n`;
        }
      }

      context += `\n`;
    }

    return context;
  }

  generateCompactContext(): string {
    return PLATFORM_FEATURES.map(f => {
      const caps = f.capabilities.map(c => c.name).join(', ');
      return `${f.name} (${f.category}): ${f.description}. Features: ${caps}`;
    }).join('\n');
  }

  getCategories(): FeatureCategory[] {
    return [...new Set(PLATFORM_FEATURES.map(f => f.category))];
  }

  /**
   * Trinity Sync - Get registry sync status for orchestration awareness
   * Called on startup and after republish to ensure Trinity is always aware
   */
  private lastSyncedAt: Date = new Date();
  private syncVersion: number = 1;

  getSyncStatus(): {
    lastSyncedAt: Date;
    syncVersion: number;
    featureCount: number;
    enabledCount: number;
    categories: FeatureCategory[];
  } {
    const enabled = PLATFORM_FEATURES.filter(f => f.enabled);
    return {
      lastSyncedAt: this.lastSyncedAt,
      syncVersion: this.syncVersion,
      featureCount: PLATFORM_FEATURES.length,
      enabledCount: enabled.length,
      categories: this.getCategories(),
    };
  }

  /**
   * Refresh sync - called after deployment or when Trinity needs to reload
   * Increments version and updates timestamp for clients to detect changes
   */
  refreshSync(): { syncVersion: number; lastSyncedAt: Date } {
    this.syncVersion++;
    this.lastSyncedAt = new Date();
    log.info(`[PlatformFeatureRegistry] Trinity sync refreshed: v${this.syncVersion} at ${this.lastSyncedAt.toISOString()}`);
    return {
      syncVersion: this.syncVersion,
      lastSyncedAt: this.lastSyncedAt,
    };
  }

  /**
   * Generate Trinity awareness context - compact summary for AI Brain
   */
  generateTrinityAwareness(): string {
    const status = this.getSyncStatus();
    return `Platform Feature Registry (v${status.syncVersion}, synced ${status.lastSyncedAt.toISOString()})
Total Features: ${status.featureCount} (${status.enabledCount} enabled)
Categories: ${status.categories.join(', ')}
I am aware of all platform capabilities and can orchestrate any feature.`;
  }
}

export const platformFeatureRegistry = new PlatformFeatureRegistry();

// Auto-log on startup for Trinity awareness
log.info('[PlatformFeatureRegistry] Initialized for Trinity orchestration:', platformFeatureRegistry.getSyncStatus());
