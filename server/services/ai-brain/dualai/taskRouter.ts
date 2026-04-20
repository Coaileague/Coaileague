
import { createLogger } from '../../../lib/logger';
const log = createLogger('trinityTaskRouter');
/**
 * Trinity Task Router
 *
 * Picks the internal reasoning path Trinity uses for each task. The backend
 * names below are compute paths, not separate agents. Trinity is one agent
 * with one personality; these labels exist only so audit logs can explain
 * which reasoning profile handled a given request.
 *
 * Compute-path profiles:
 * - orchestration   — scheduling, monitoring, data analysis, platform ops
 * - specialist      — writing, legal reasoning, compliance, contracts, strategy
 * - support         — customer support, knowledge synthesis, training content
 *
 * The `AIProvider` enum values (`'trinity' | 'claude' | 'gpt4'`) are legacy
 * path labels kept for backwards compat with existing audit-log rows. They
 * will be renamed to path-based values in a later phase.
 *
 * Uses weighted keyword scoring (not string.includes) for accurate
 * intent classification.
 */

export type AIProvider = 'trinity' | 'claude' | 'gpt4';

export interface TaskRoutingDecision {
  primaryAi: AIProvider;
  supportAi?: AIProvider;
  collaborationType?: 'data_enrichment' | 'consultation' | 'task_handoff' | 'verification' | 'joint_workflow';
  reason: string;
  dataNeeds?: string[];
  estimatedCredits: number;
}

export type TaskType = 
  | 'rfp_response'
  | 'capability_statement'
  | 'compliance_analysis'
  | 'contract_review'
  | 'strategic_planning'
  | 'document_generation'
  | 'chatbot_query'
  | 'scheduling_optimization'
  | 'payroll_processing'
  | 'financial_analysis'
  | 'time_tracking_analysis'
  | 'platform_monitoring'
  | 'employee_onboarding'
  | 'audit_preparation'
  | 'financial_report'
  | 'incident_analysis'
  | 'client_communication'
  | 'ceo_briefing'
  | 'cfo_dashboard'
  | 'support_escalation'
  | 'training_content'
  | 'risk_assessment'
  | 'pdf_generation'
  | 'data_research'
  | 'math_verification'
  | 'workflow_automation'
  | 'data_presentation'
  | 'general';

const TRINITY_TASKS: TaskType[] = [
  'scheduling_optimization',
  'payroll_processing',
  'time_tracking_analysis',
  'platform_monitoring',
  'employee_onboarding',
  'incident_analysis',
  'ceo_briefing',
  'workflow_automation',
];

const CLAUDE_TASKS: TaskType[] = [
  'rfp_response',
  'capability_statement',
  'compliance_analysis',
  'contract_review',
  'strategic_planning',
  'document_generation',
  'client_communication',
  'risk_assessment',
  'data_presentation',
];

const GPT4_TASKS: TaskType[] = [
  'support_escalation',
  'training_content',
  'chatbot_query',
];

const COLLABORATIVE_TASKS: { task: TaskType; pattern: { primary: AIProvider; support: AIProvider; type: TaskRoutingDecision['collaborationType'] } }[] = [
  { task: 'financial_analysis', pattern: { primary: 'trinity', support: 'claude', type: 'consultation' } },
  { task: 'financial_report', pattern: { primary: 'trinity', support: 'claude', type: 'data_enrichment' } },
  { task: 'audit_preparation', pattern: { primary: 'claude', support: 'trinity', type: 'data_enrichment' } },
  { task: 'cfo_dashboard', pattern: { primary: 'trinity', support: 'claude', type: 'joint_workflow' } },
  { task: 'ceo_briefing', pattern: { primary: 'trinity', support: 'claude', type: 'data_enrichment' } },
  { task: 'risk_assessment', pattern: { primary: 'claude', support: 'trinity', type: 'verification' } },
  { task: 'support_escalation', pattern: { primary: 'gpt4', support: 'trinity', type: 'task_handoff' } },
  { task: 'math_verification', pattern: { primary: 'trinity', support: 'claude', type: 'verification' } },
  { task: 'pdf_generation', pattern: { primary: 'trinity', support: 'claude', type: 'data_enrichment' } },
  { task: 'data_research', pattern: { primary: 'claude', support: 'trinity', type: 'data_enrichment' } },
];

const CREDIT_ESTIMATES: Record<TaskType, number> = {
  rfp_response: 35,
  capability_statement: 30,
  compliance_analysis: 25,
  contract_review: 30,
  strategic_planning: 40,
  document_generation: 25,
  chatbot_query: 5,
  scheduling_optimization: 5,
  payroll_processing: 5,
  financial_analysis: 20,
  time_tracking_analysis: 5,
  platform_monitoring: 5,
  employee_onboarding: 10,
  audit_preparation: 35,
  financial_report: 25,
  incident_analysis: 5,
  client_communication: 15,
  ceo_briefing: 30,
  cfo_dashboard: 25,
  support_escalation: 15,
  training_content: 20,
  risk_assessment: 30,
  pdf_generation: 10,
  data_research: 15,
  math_verification: 5,
  workflow_automation: 8,
  data_presentation: 12,
  general: 10,
};

interface IntentSignal {
  keywords: string[];
  weight: number;
}

const INTENT_SIGNALS: Record<TaskType, IntentSignal[]> = {
  rfp_response: [
    { keywords: ['rfp', 'request for proposal'], weight: 10 },
    { keywords: ['proposal', 'bid', 'tender', 'solicitation'], weight: 6 },
    { keywords: ['submission', 'response deadline', 'win rate'], weight: 4 },
  ],
  capability_statement: [
    { keywords: ['capability statement', 'company profile'], weight: 10 },
    { keywords: ['capability', 'qualifications', 'past performance'], weight: 5 },
    { keywords: ['sam.gov', 'naics', 'duns'], weight: 4 },
  ],
  compliance_analysis: [
    { keywords: ['compliance', 'regulatory', 'regulation'], weight: 8 },
    { keywords: ['labor law', 'osha', 'flsa', 'eeoc', 'ada'], weight: 7 },
    { keywords: ['license', 'certification', 'permit'], weight: 5 },
    { keywords: ['violation', 'penalty', 'fine'], weight: 4 },
  ],
  contract_review: [
    { keywords: ['contract review', 'contract analysis'], weight: 10 },
    { keywords: ['contract', 'agreement', 'terms', 'clause'], weight: 6 },
    { keywords: ['legal', 'liability', 'indemnification', 'sla'], weight: 5 },
    { keywords: ['negotiate', 'amendment', 'renewal'], weight: 4 },
  ],
  strategic_planning: [
    { keywords: ['strategic plan', 'business strategy'], weight: 10 },
    { keywords: ['strategic', 'growth', 'expansion', 'roadmap'], weight: 6 },
    { keywords: ['market', 'competitive', 'swot', 'positioning'], weight: 5 },
    { keywords: ['long-term', 'vision', 'mission', 'objective'], weight: 3 },
  ],
  scheduling_optimization: [
    { keywords: ['schedule optimization', 'auto-schedule'], weight: 10 },
    { keywords: ['schedule', 'shift', 'roster', 'assign'], weight: 6 },
    { keywords: ['coverage', 'staffing', 'availability'], weight: 5 },
    { keywords: ['overtime', 'swap', 'open shift'], weight: 4 },
  ],
  payroll_processing: [
    { keywords: ['payroll', 'pay run', 'pay period'], weight: 10 },
    { keywords: ['salary', 'wage', 'compensation', 'deduction'], weight: 6 },
    { keywords: ['tax', 'withholding', 'w2', '1099'], weight: 5 },
    { keywords: ['direct deposit', 'pay stub', 'garnishment'], weight: 4 },
  ],
  financial_analysis: [
    { keywords: ['financial analysis', 'financial review'], weight: 10 },
    { keywords: ['revenue', 'profit', 'margin', 'cash flow'], weight: 6 },
    { keywords: ['financial', 'budget', 'forecast', 'projection'], weight: 5 },
    { keywords: ['roi', 'expense', 'cost analysis'], weight: 4 },
  ],
  time_tracking_analysis: [
    { keywords: ['time tracking', 'timesheet'], weight: 10 },
    { keywords: ['clock in', 'clock out', 'hours worked'], weight: 7 },
    { keywords: ['time', 'attendance', 'punch'], weight: 4 },
    { keywords: ['overtime calculation', 'break compliance'], weight: 5 },
  ],
  platform_monitoring: [
    { keywords: ['platform monitoring', 'system health'], weight: 10 },
    { keywords: ['monitor', 'health check', 'uptime'], weight: 6 },
    { keywords: ['status', 'performance', 'latency', 'error rate'], weight: 4 },
    { keywords: ['alert', 'threshold', 'sla breach'], weight: 5 },
  ],
  employee_onboarding: [
    { keywords: ['onboarding', 'new hire'], weight: 10 },
    { keywords: ['onboard', 'new employee', 'orientation'], weight: 7 },
    { keywords: ['hire', 'welcome', 'first day', 'i-9'], weight: 4 },
    { keywords: ['training plan', 'mentor assignment'], weight: 5 },
  ],
  audit_preparation: [
    { keywords: ['audit preparation', 'audit readiness'], weight: 10 },
    { keywords: ['audit', 'inspection', 'review'], weight: 6 },
    { keywords: ['sox', 'internal controls', 'documentation'], weight: 5 },
    { keywords: ['evidence', 'findings', 'remediation'], weight: 4 },
  ],
  financial_report: [
    { keywords: ['financial report', 'financial statement'], weight: 10 },
    { keywords: ['report', 'p&l', 'balance sheet', 'income statement'], weight: 6 },
    { keywords: ['quarterly', 'annual', 'monthly report'], weight: 5 },
  ],
  incident_analysis: [
    { keywords: ['incident analysis', 'security incident'], weight: 10 },
    { keywords: ['incident', 'security event', 'breach'], weight: 7 },
    { keywords: ['root cause', 'post-mortem', 'forensics'], weight: 5 },
    { keywords: ['vulnerability', 'threat', 'anomaly'], weight: 4 },
  ],
  client_communication: [
    { keywords: ['client email', 'client letter'], weight: 10 },
    { keywords: ['email', 'letter', 'correspondence'], weight: 5 },
    { keywords: ['client', 'customer', 'stakeholder'], weight: 4 },
    { keywords: ['communication', 'outreach', 'follow-up'], weight: 3 },
  ],
  document_generation: [
    { keywords: ['generate document', 'create document'], weight: 10 },
    { keywords: ['document', 'write', 'draft', 'compose'], weight: 5 },
    { keywords: ['template', 'format', 'memo', 'policy'], weight: 4 },
  ],
  ceo_briefing: [
    { keywords: ['ceo briefing', 'executive summary', 'executive briefing'], weight: 10 },
    { keywords: ['ceo', 'executive', 'c-suite', 'board'], weight: 6 },
    { keywords: ['briefing', 'dashboard', 'kpi summary'], weight: 5 },
    { keywords: ['overview', 'highlights', 'top-line'], weight: 3 },
  ],
  cfo_dashboard: [
    { keywords: ['cfo dashboard', 'financial dashboard'], weight: 10 },
    { keywords: ['cfo', 'treasury', 'cash position'], weight: 7 },
    { keywords: ['accounts receivable', 'accounts payable', 'burn rate'], weight: 5 },
    { keywords: ['financial health', 'liquidity', 'working capital'], weight: 4 },
  ],
  support_escalation: [
    { keywords: ['escalate', 'escalation', 'tier 2'], weight: 10 },
    { keywords: ['support ticket', 'help desk', 'customer issue'], weight: 6 },
    { keywords: ['urgent', 'priority', 'sla violation'], weight: 5 },
    { keywords: ['unresolved', 'complaint', 'dissatisfied'], weight: 4 },
  ],
  training_content: [
    { keywords: ['training material', 'training content'], weight: 10 },
    { keywords: ['training', 'tutorial', 'how-to', 'guide'], weight: 6 },
    { keywords: ['learning', 'course', 'curriculum', 'lesson'], weight: 5 },
    { keywords: ['knowledge base', 'documentation', 'faq'], weight: 3 },
  ],
  risk_assessment: [
    { keywords: ['risk assessment', 'risk analysis'], weight: 10 },
    { keywords: ['risk', 'exposure', 'mitigation'], weight: 6 },
    { keywords: ['contingency', 'insurance', 'liability'], weight: 5 },
    { keywords: ['compliance risk', 'operational risk', 'financial risk'], weight: 4 },
  ],
  pdf_generation: [
    { keywords: ['generate pdf', 'create pdf', 'export pdf'], weight: 10 },
    { keywords: ['pdf', 'printable', 'download report'], weight: 6 },
    { keywords: ['export', 'print', 'document output'], weight: 3 },
  ],
  data_research: [
    { keywords: ['research', 'investigate', 'deep dive'], weight: 10 },
    { keywords: ['analyze data', 'find patterns', 'data analysis'], weight: 8 },
    { keywords: ['correlate', 'cross-reference', 'compare data'], weight: 6 },
    { keywords: ['anomaly', 'outlier', 'unusual', 'trend'], weight: 5 },
  ],
  math_verification: [
    { keywords: ['verify calculation', 'check math', 'validate numbers'], weight: 10 },
    { keywords: ['double check', 'cross check', 'reconcile'], weight: 7 },
    { keywords: ['arithmetic', 'calculation error', 'rounding'], weight: 6 },
    { keywords: ['verify total', 'check balance', 'audit numbers'], weight: 5 },
  ],
  workflow_automation: [
    { keywords: ['automate', 'automation', 'workflow'], weight: 8 },
    { keywords: ['trigger', 'auto-assign', 'auto-schedule'], weight: 6 },
    { keywords: ['rule', 'condition', 'if-then', 'when'], weight: 4 },
    { keywords: ['batch', 'bulk', 'mass update'], weight: 5 },
  ],
  data_presentation: [
    { keywords: ['present data', 'data presentation', 'visualization'], weight: 10 },
    { keywords: ['chart', 'graph', 'dashboard', 'infographic'], weight: 7 },
    { keywords: ['summarize', 'format data', 'display metrics'], weight: 5 },
    { keywords: ['table', 'breakdown', 'overview'], weight: 3 },
  ],
  chatbot_query: [
    { keywords: ['chat', 'question', 'ask', 'help'], weight: 2 },
  ],
  general: [],
};

class TaskRouter {
  routeTask(taskType: TaskType, dataNeeds: string[] = []): TaskRoutingDecision {
    const collaborative = COLLABORATIVE_TASKS.find(c => c.task === taskType);
    if (collaborative) {
      return {
        primaryAi: collaborative.pattern.primary,
        supportAi: collaborative.pattern.support,
        collaborationType: collaborative.pattern.type,
        reason: this.getCollaborativeReason(taskType, collaborative.pattern),
        dataNeeds: dataNeeds,
        estimatedCredits: CREDIT_ESTIMATES[taskType] || 10,
      };
    }

    if (TRINITY_TASKS.includes(taskType)) {
      return {
        primaryAi: 'trinity',
        reason: this.getTrinityReason(taskType),
        dataNeeds: dataNeeds,
        estimatedCredits: CREDIT_ESTIMATES[taskType] || 5,
      };
    }

    if (CLAUDE_TASKS.includes(taskType)) {
      const needsData = dataNeeds.length > 0;
      return {
        primaryAi: 'claude',
        supportAi: needsData ? 'trinity' : undefined,
        collaborationType: needsData ? 'data_enrichment' : undefined,
        reason: this.getClaudeReason(taskType, needsData),
        dataNeeds: dataNeeds,
        estimatedCredits: CREDIT_ESTIMATES[taskType] || 10,
      };
    }

    if (GPT4_TASKS.includes(taskType)) {
      return {
        primaryAi: 'gpt4',
        reason: this.getGPT4Reason(taskType),
        dataNeeds: dataNeeds,
        estimatedCredits: CREDIT_ESTIMATES[taskType] || 10,
      };
    }

    return {
      primaryAi: 'trinity',
      reason: 'Default routing to Trinity for general tasks',
      dataNeeds: dataNeeds,
      estimatedCredits: CREDIT_ESTIMATES[taskType] || 10,
    };
  }

  private getTrinityReason(taskType: TaskType): string {
    const reasons: Record<string, string> = {
      scheduling_optimization: 'Data-driven optimization is Trinity\'s strength',
      payroll_processing: 'Numerical calculations and automation are Trinity\'s domain',
      time_tracking_analysis: 'Real-time data analysis routed to Trinity',
      platform_monitoring: 'System monitoring is Trinity\'s core function',
      employee_onboarding: 'Process automation handled by Trinity',
      incident_analysis: 'Pattern detection and analysis routed to Trinity',
      ceo_briefing: 'Trinity aggregates cross-platform data for executive briefings',
      workflow_automation: 'Workflow automation and process orchestration is Trinity\'s domain',
    };
    return reasons[taskType] || 'Routed to Trinity for data processing';
  }

  private getClaudeReason(taskType: TaskType, needsData: boolean): string {
    const reasons: Record<string, string> = {
      rfp_response: 'Complex writing and persuasion is Claude\'s specialty',
      capability_statement: 'Professional document generation routed to Claude',
      compliance_analysis: 'Legal interpretation and reasoning is Claude\'s strength',
      contract_review: 'Contract analysis requires Claude\'s reasoning capabilities',
      strategic_planning: 'Strategic thinking and planning routed to Claude',
      document_generation: 'Document generation is Claude\'s domain',
      client_communication: 'Professional communication handled by Claude',
      risk_assessment: 'Risk analysis and mitigation planning is Claude\'s forte',
      data_presentation: 'Data formatting and presentation requires Claude\'s writing precision',
    };
    const baseReason = reasons[taskType] || 'Routed to Claude for complex reasoning';
    return needsData ? `${baseReason}; Trinity provides data context` : baseReason;
  }

  private getGPT4Reason(taskType: TaskType): string {
    const reasons: Record<string, string> = {
      support_escalation: 'GPT-4 handles customer support escalations with empathy and precision',
      training_content: 'GPT-4 generates structured training materials and guides',
      chatbot_query: 'GPT-4 provides conversational support responses',
    };
    return reasons[taskType] || 'Routed to GPT-4 for support tasks';
  }

  private getCollaborativeReason(taskType: TaskType, pattern: { primary: AIProvider; support: AIProvider; type: TaskRoutingDecision['collaborationType'] }): string {
    const reasons: Record<string, string> = {
      financial_analysis: 'Trinity analyzes data, Claude provides strategic insights',
      financial_report: 'Trinity crunches numbers, Claude writes executive summary',
      audit_preparation: 'Claude identifies requirements, Trinity gathers documentation',
      cfo_dashboard: 'Trinity pulls real-time financials, Claude provides CFO-grade analysis',
      ceo_briefing: 'Trinity aggregates platform metrics, Claude drafts executive narrative',
      risk_assessment: 'Claude evaluates risk factors, Trinity verifies against platform data',
      support_escalation: 'GPT-4 handles customer interaction, Trinity provides account context',
      math_verification: 'Trinity computes deterministically, Claude verifies logic and edge cases',
      pdf_generation: 'Trinity gathers data and structures content, Claude formats and polishes',
      data_research: 'Claude leads analysis and findings, Trinity provides raw platform data',
    };
    return reasons[taskType] || `${pattern.primary} leads with ${pattern.support} support (${pattern.type})`;
  }

  inferTaskType(task: string): TaskType {
    const taskLower = task.toLowerCase();
    const scores: Partial<Record<TaskType, number>> = {};

    for (const [taskType, signals] of Object.entries(INTENT_SIGNALS)) {
      let score = 0;
      for (const signal of signals) {
        for (const keyword of signal.keywords) {
          if (taskLower.includes(keyword)) {
            score += signal.weight;
          }
        }
      }
      if (score > 0) {
        scores[taskType as TaskType] = score;
      }
    }

    if (Object.keys(scores).length === 0) {
      return 'general';
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestMatch, bestScore] = sorted[0];
    const secondBest = sorted.length > 1 ? sorted[1] : null;

    if (secondBest && bestScore === secondBest[1]) {
      const orderedTypes: TaskType[] = [
        'ceo_briefing', 'cfo_dashboard', 'rfp_response', 'compliance_analysis',
        'contract_review', 'financial_report', 'financial_analysis',
        'math_verification', 'audit_preparation', 'risk_assessment', 'strategic_planning',
        'data_research', 'pdf_generation', 'data_presentation',
        'scheduling_optimization', 'payroll_processing', 'incident_analysis',
        'workflow_automation', 'support_escalation', 'employee_onboarding', 'time_tracking_analysis',
        'platform_monitoring', 'client_communication', 'document_generation',
        'capability_statement', 'training_content', 'chatbot_query', 'general',
      ];
      const tiedTypes = sorted.filter(([_, s]) => s === bestScore).map(([t]) => t as TaskType);
      for (const t of orderedTypes) {
        if (tiedTypes.includes(t)) return t;
      }
    }

    return bestMatch as TaskType;
  }

  getTrinityTaskTypes(): TaskType[] {
    return [...TRINITY_TASKS];
  }

  getClaudeTaskTypes(): TaskType[] {
    return [...CLAUDE_TASKS];
  }

  getGPT4TaskTypes(): TaskType[] {
    return [...GPT4_TASKS];
  }

  getCollaborativeTaskTypes(): { task: TaskType; pattern: { primary: AIProvider; support: AIProvider; type: TaskRoutingDecision['collaborationType'] } }[] {
    return [...COLLABORATIVE_TASKS];
  }

  getCreditEstimate(taskType: TaskType): number {
    return CREDIT_ESTIMATES[taskType] || 10;
  }
}

export const taskRouter = new TaskRouter();
