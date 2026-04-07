export type WidgetType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'confirm'
  | 'display'
  | 'textarea';

export interface IntakeStep {
  id: string;
  question: string;
  subtext?: string;
  widgetType: WidgetType;
  fieldId: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  skipIf?: {
    fieldId: string;
    value: string | boolean;
  };
}

export interface IntakeFlow {
  flowType: string;
  title: string;
  greeting: string;
  completionMessage: string;
  steps: IntakeStep[];
  trinityAction: string;
}

export const TRINITY_INTAKE_FLOWS: Record<string, IntakeFlow> = {

  support_triage: {
    flowType: 'support_triage',
    title: 'Support Request',
    greeting: "I'm here to help. Let me ask you a few quick questions so I can resolve this as fast as possible.",
    completionMessage: "Thank you. I'm looking into this right now.",
    trinityAction: 'support.triage.process',
    steps: [
      {
        id: 'step_1',
        question: 'What can I help you with today?',
        widgetType: 'select',
        fieldId: 'issue_category',
        required: true,
        options: [
          'I cannot log into my account',
          'I am not receiving notifications',
          'My schedule looks wrong',
          'My paycheck has an error',
          'I cannot find my documents',
          'My onboarding is stuck',
          'I need to report a problem',
          'Something else'
        ]
      },
      {
        id: 'step_2',
        question: 'Can you describe the issue in a little more detail?',
        subtext: 'The more specific you are the faster I can fix it.',
        widgetType: 'textarea',
        fieldId: 'issue_description',
        required: true,
        placeholder: 'Tell me what happened...'
      },
      {
        id: 'step_3',
        question: 'When did this start happening?',
        widgetType: 'select',
        fieldId: 'issue_timing',
        required: true,
        options: [
          'Just now',
          'Earlier today',
          'Yesterday',
          'A few days ago',
          'More than a week ago'
        ]
      },
      {
        id: 'step_4',
        question: 'Is this affecting your ability to work your shift?',
        widgetType: 'radio',
        fieldId: 'is_urgent',
        required: true,
        options: ['Yes — I need this fixed immediately', 'No — it can wait']
      }
    ]
  },

  account_locked: {
    flowType: 'account_locked',
    title: 'Account Access Issue',
    greeting: 'I can unlock your account right now. I just need to verify a couple of things.',
    completionMessage: 'Verifying your identity now. Give me just a moment.',
    trinityAction: 'support.account.unlock',
    steps: [
      {
        id: 'step_1',
        question: 'What is your employee number?',
        subtext: 'It starts with EMP- and can be found on any of your pay stubs.',
        widgetType: 'text',
        fieldId: 'employee_number',
        required: true,
        placeholder: 'EMP-XXX-00000'
      },
      {
        id: 'step_2',
        question: 'What is your date of birth?',
        subtext: 'This is used to verify your identity.',
        widgetType: 'date',
        fieldId: 'date_of_birth',
        required: true
      },
      {
        id: 'step_3',
        question: 'What is the best phone number to reach you?',
        widgetType: 'phone',
        fieldId: 'phone_number',
        required: true,
        placeholder: '(xxx) xxx-xxxx'
      }
    ]
  },

  calloff_report: {
    flowType: 'calloff_report',
    title: 'Call-Off Report',
    greeting: 'I will process your call-off and start finding coverage right away. Quick questions first.',
    completionMessage: 'Got it. I am notifying your supervisor and starting the replacement process now.',
    trinityAction: 'calloff.process',
    steps: [
      {
        id: 'step_1',
        question: 'What is the reason for your call-off?',
        widgetType: 'select',
        fieldId: 'calloff_reason',
        required: true,
        options: [
          'Sick — illness',
          'Family emergency',
          'Personal emergency',
          'Medical appointment',
          'Car trouble',
          'Other'
        ]
      },
      {
        id: 'step_2',
        question: 'Can you provide any additional details?',
        widgetType: 'textarea',
        fieldId: 'calloff_details',
        required: false,
        placeholder: 'Optional — any additional information...'
      },
      {
        id: 'step_3',
        question: 'Will you be available for your next scheduled shift?',
        widgetType: 'radio',
        fieldId: 'next_shift_availability',
        required: true,
        options: ['Yes', 'No — I am not sure yet', 'No — I need extended leave']
      }
    ]
  },

  payroll_dispute: {
    flowType: 'payroll_dispute',
    title: 'Payroll Dispute',
    greeting: 'I take payroll issues seriously. Let me collect the details so I can investigate immediately.',
    completionMessage: 'I am pulling your timesheet and payroll records now. I will have an answer for you shortly.',
    trinityAction: 'support.payroll.dispute',
    steps: [
      {
        id: 'step_1',
        question: 'What type of payroll error are you reporting?',
        widgetType: 'select',
        fieldId: 'dispute_type',
        required: true,
        options: [
          'Missing hours — I worked more than I was paid for',
          'Wrong pay rate — incorrect hourly rate used',
          'Missing shift — entire shift not included',
          'Deduction error — wrong deduction taken',
          'Direct deposit — payment not received',
          'Other'
        ]
      },
      {
        id: 'step_2',
        question: 'How many hours do you believe are missing or incorrect?',
        widgetType: 'number',
        fieldId: 'disputed_hours',
        required: true,
        placeholder: '0.0',
        validation: { min: 0.5, max: 168 }
      },
      {
        id: 'step_3',
        question: 'Which dates were affected?',
        widgetType: 'textarea',
        fieldId: 'affected_dates',
        required: true,
        placeholder: 'Example: March 15, March 16, March 20...'
      },
      {
        id: 'step_4',
        question: 'Any additional information that would help me investigate?',
        widgetType: 'textarea',
        fieldId: 'additional_info',
        required: false,
        placeholder: 'Optional...'
      }
    ]
  },

  incident_report: {
    flowType: 'incident_report',
    title: 'Incident Report',
    greeting: 'I will help you file this incident report. Please answer each question as accurately as possible.',
    completionMessage: 'Your incident report has been filed and your supervisor has been notified.',
    trinityAction: 'incident.create',
    steps: [
      {
        id: 'step_1',
        question: 'What type of incident occurred?',
        widgetType: 'select',
        fieldId: 'incident_type',
        required: true,
        options: [
          'Trespassing',
          'Theft or attempted theft',
          'Assault or altercation',
          'Medical emergency',
          'Suspicious activity',
          'Property damage',
          'Workplace injury',
          'Other'
        ]
      },
      {
        id: 'step_2',
        question: 'When did the incident occur?',
        widgetType: 'date',
        fieldId: 'incident_date',
        required: true
      },
      {
        id: 'step_3',
        question: 'Where did the incident occur?',
        widgetType: 'text',
        fieldId: 'incident_location',
        required: true,
        placeholder: 'Building, area, or address...'
      },
      {
        id: 'step_4',
        question: 'Describe what happened in detail.',
        subtext: 'Include who was involved, what occurred, and the sequence of events.',
        widgetType: 'textarea',
        fieldId: 'incident_description',
        required: true,
        placeholder: 'Describe the incident...'
      },
      {
        id: 'step_5',
        question: 'Were police or emergency services called?',
        widgetType: 'radio',
        fieldId: 'emergency_services',
        required: true,
        options: [
          'Yes — police were called',
          'Yes — medical services were called',
          'Yes — both were called',
          'No'
        ]
      },
      {
        id: 'step_6',
        question: 'Were there any witnesses?',
        widgetType: 'radio',
        fieldId: 'has_witnesses',
        required: true,
        options: ['Yes', 'No']
      },
      {
        id: 'step_7',
        question: 'Witness names and contact information if known.',
        widgetType: 'textarea',
        fieldId: 'witness_info',
        required: false,
        placeholder: 'Names and contact info if available...',
        skipIf: { fieldId: 'has_witnesses', value: 'No' }
      }
    ]
  },

  notification_fix: {
    flowType: 'notification_fix',
    title: 'Notification Issue',
    greeting: 'I can diagnose and fix notification issues immediately. A couple of quick questions.',
    completionMessage: 'Checking your notification settings and delivery logs now.',
    trinityAction: 'support.notification.diagnose',
    steps: [
      {
        id: 'step_1',
        question: 'What type of notifications are you not receiving?',
        widgetType: 'select',
        fieldId: 'notification_type',
        required: true,
        options: [
          'Shift assignments',
          'Shift reminders',
          'Call-off alerts',
          'Schedule changes',
          'Payroll notifications',
          'All notifications',
          'Other'
        ]
      },
      {
        id: 'step_2',
        question: 'Which channel is not working?',
        widgetType: 'select',
        fieldId: 'channel',
        required: true,
        options: [
          'Email',
          'Text message',
          'Push notification',
          'All channels'
        ]
      },
      {
        id: 'step_3',
        question: 'When did you last receive a notification?',
        widgetType: 'select',
        fieldId: 'last_received',
        required: true,
        options: [
          'Earlier today',
          'Yesterday',
          'A few days ago',
          'More than a week ago',
          'Never'
        ]
      },
      {
        id: 'step_4',
        question: 'What is the best email or phone number to test a notification to?',
        widgetType: 'text',
        fieldId: 'test_destination',
        required: true,
        placeholder: 'Email or phone number...'
      }
    ]
  }

};

export function detectIntakeFlow(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.includes('locked out') || lower.includes('cannot log in') ||
      lower.includes("can't log in") || lower.includes('account locked') ||
      lower.includes('cant log in')) {
    return 'account_locked';
  }

  if (lower.includes('call off') || lower.includes('calloff') ||
      lower.includes('calling off') || lower.includes("can't make my shift") ||
      lower.includes('cant make my shift')) {
    return 'calloff_report';
  }

  if (lower.includes('paycheck') || lower.includes('payroll') ||
      lower.includes('missing hours') || lower.includes('wrong pay') ||
      lower.includes('not paid') || lower.includes('pay dispute')) {
    return 'payroll_dispute';
  }

  if (lower.includes('incident') || lower.includes('trespass') ||
      lower.includes('theft') || lower.includes('assault') ||
      lower.includes('report an incident') || lower.includes('file a report')) {
    return 'incident_report';
  }

  if (lower.includes('notification') || lower.includes('not receiving') ||
      lower.includes('no alerts') || lower.includes('missing alerts') ||
      lower.includes('not getting')) {
    return 'notification_fix';
  }

  if (lower.includes('help') || lower.includes('support') ||
      lower.includes('issue') || lower.includes('problem')) {
    return 'support_triage';
  }

  return null;
}
