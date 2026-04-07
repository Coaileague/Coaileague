/**
 * Broadcast System Type Definitions
 * For org-level and platform-level announcements, alerts, and feedback requests
 */

// ============================================
// ENUMS & CONSTANTS
// ============================================

export type BroadcastType = 
  | 'announcement'      // General news, updates
  | 'alert'             // Urgent/important (weather, emergency)
  | 'system_notice'     // Maintenance, downtime, known issues
  | 'feature_release'   // New features, bots, commands
  | 'feedback_request'  // Interactive - opens form
  | 'pass_down'         // Security shift pass-down info
  | 'policy_update'     // Compliance, rules changes
  | 'celebration'       // Holidays, milestones, kudos
  | 'briefing';         // Org Operations Briefing Channel — Trinity auto-posts, managers/owners only

export type BroadcastPriority = 
  | 'critical'  // Force-show, must acknowledge, can't dismiss
  | 'high'      // Prominent, sticky at top
  | 'normal'    // Standard notification
  | 'low';      // Collapsible, informational

export type BroadcastTargetType = 
  | 'all_org'       // All employees in the organization
  | 'all_platform'  // All users on the platform
  | 'individuals'   // Specific employee IDs
  | 'team'          // Specific team
  | 'department'    // Specific department
  | 'role'          // By role (officer, supervisor, manager)
  | 'site'          // All employees assigned to a site
  | 'site_shift';   // Employees scheduled at site on specific date

export type BroadcastActionType = 
  | 'none'           // Just informational
  | 'link'           // Opens external/internal link
  | 'acknowledge'    // Must click to confirm receipt
  | 'feedback_form'  // Opens feedback submission form
  | 'survey';        // Opens survey (future)

export type BroadcastCreatorType = 
  | 'user'     // Org owner/admin/manager
  | 'support'  // Platform support agent
  | 'bot'      // Automated bot
  | 'trinity'  // Trinity AI
  | 'system';  // System automated

export type FeedbackType = 
  | 'idea'       // Feature request, suggestion
  | 'bug'        // Bug report
  | 'complaint'  // Issue/problem
  | 'praise'     // Positive feedback
  | 'general';   // Other

export type FeedbackStatus = 
  | 'new'
  | 'reviewed'
  | 'in_progress'
  | 'resolved'
  | 'archived';

// ============================================
// CONFIGURATION TYPES
// ============================================

export interface TargetConfigAllOrg {
  type: 'all_org';
}

export interface TargetConfigAllPlatform {
  type: 'all_platform';
}

export interface TargetConfigIndividuals {
  type: 'individuals';
  employeeIds: string[];
}

export interface TargetConfigTeam {
  type: 'team';
  teamId: string;
}

export interface TargetConfigDepartment {
  type: 'department';
  departmentId: string;
}

export interface TargetConfigRole {
  type: 'role';
  roles: string[];  // 'officer', 'supervisor', 'manager', etc.
}

export interface TargetConfigSite {
  type: 'site';
  siteId: string;
}

export interface TargetConfigSiteShift {
  type: 'site_shift';
  siteId: string;
  shiftDate: string;  // ISO date string
}

export type TargetConfig = 
  | TargetConfigAllOrg
  | TargetConfigAllPlatform
  | TargetConfigIndividuals
  | TargetConfigTeam
  | TargetConfigDepartment
  | TargetConfigRole
  | TargetConfigSite
  | TargetConfigSiteShift;

export interface ActionConfigNone {
  type: 'none';
}

export interface ActionConfigLink {
  type: 'link';
  url: string;
  label: string;
  openInNewTab?: boolean;
}

export interface ActionConfigAcknowledge {
  type: 'acknowledge';
  buttonLabel?: string;  // Default: "I Acknowledge"
  requireReason?: boolean;  // Optionally require a note
}

export interface ActionConfigFeedbackForm {
  type: 'feedback_form';
  formType: FeedbackType;
  allowAnonymous?: boolean;
  requireSubject?: boolean;
  customFields?: Array<{
    name: string;
    label: string;
    type: 'text' | 'textarea' | 'select';
    options?: string[];
    required?: boolean;
  }>;
}

export interface ActionConfigSurvey {
  type: 'survey';
  surveyId: string;
  surveyUrl?: string;
}

export type ActionConfig = 
  | ActionConfigNone
  | ActionConfigLink
  | ActionConfigAcknowledge
  | ActionConfigFeedbackForm
  | ActionConfigSurvey;

// ============================================
// PASS-DOWN SPECIFIC (Security Industry)
// ============================================

export interface PassDownData {
  incidents: Array<{
    time?: string;
    description: string;
    severity?: 'low' | 'medium' | 'high';
    resolved?: boolean;
  }>;
  clientNotes: Array<{
    note: string;
    important?: boolean;
  }>;
  equipmentIssues: Array<{
    equipment: string;
    issue: string;
    reported?: boolean;
  }>;
  specialInstructions: string[];
  weatherAlert?: {
    condition: string;
    advisory: string;
  };
  keyContacts?: Array<{
    name: string;
    role: string;
    phone?: string;
  }>;
}

// ============================================
// MAIN ENTITY TYPES
// ============================================

export interface Broadcast {
  id: string;
  workspaceId: string | null;  // null = platform-wide
  
  createdBy: string;
  createdByType: BroadcastCreatorType;
  createdByName?: string;  // Populated on fetch
  
  type: BroadcastType;
  priority: BroadcastPriority;
  
  title: string;
  message: string;
  richContent?: {
    html?: string;
    markdown?: string;
    attachments?: Array<{
      type: 'image' | 'file' | 'link';
      url: string;
      name?: string;
    }>;
  };
  
  targetType: BroadcastTargetType;
  targetConfig: TargetConfig;
  
  actionType: BroadcastActionType;
  actionConfig: ActionConfig;
  
  passDownData?: PassDownData;
  
  scheduledFor?: string;
  expiresAt?: string;
  isActive: boolean;
  isDraft: boolean;
  
  // Trinity
  trinityExecutionId?: string;
  aiGenerated: boolean;
  aiSummary?: string;
  
  // Stats (populated on fetch)
  stats?: {
    totalRecipients: number;
    delivered: number;
    read: number;
    acknowledged: number;
    feedbackCount: number;
  };
  
  createdAt: string;
  updatedAt: string;
}

export interface BroadcastRecipient {
  id: string;
  broadcastId: string;
  employeeId: string;
  userId?: string;
  
  employeeName?: string;  // Populated on fetch
  
  deliveredAt: string;
  readAt?: string;
  acknowledgedAt?: string;
  dismissedAt?: string;
  actionTakenAt?: string;
  
  responseData?: Record<string, any>;
  notificationId?: string;
  
  createdAt: string;
}

export interface BroadcastFeedback {
  id: string;
  broadcastId: string;
  employeeId: string;
  workspaceId?: string;
  
  employeeName?: string;  // Populated on fetch
  
  feedbackType: FeedbackType;
  subject?: string;
  content: string;
  category?: string;
  
  allowFollowup: boolean;
  contactMethod?: 'email' | 'in_app' | 'phone';
  
  // AI analysis
  aiSummary?: string;
  aiSentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  aiPriorityScore?: number;
  aiCategories?: string[];
  aiActionItems?: string[];
  
  status: FeedbackStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  resolutionNotes?: string;
  
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

export interface CreateBroadcastRequest {
  type: BroadcastType;
  priority?: BroadcastPriority;
  title: string;
  message: string;
  richContent?: Broadcast['richContent'];
  
  targetType: BroadcastTargetType;
  targetConfig: TargetConfig;
  
  actionType?: BroadcastActionType;
  actionConfig?: ActionConfig;
  
  passDownData?: PassDownData;
  
  scheduledFor?: string;
  expiresAt?: string;
  isDraft?: boolean;
}

export interface UpdateBroadcastRequest {
  title?: string;
  message?: string;
  richContent?: Broadcast['richContent'];
  priority?: BroadcastPriority;
  expiresAt?: string;
  isActive?: boolean;
}

export interface ListBroadcastsParams {
  workspaceId?: string;
  type?: BroadcastType;
  priority?: BroadcastPriority;
  isActive?: boolean;
  includeDrafts?: boolean;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}

export interface AcknowledgeBroadcastRequest {
  broadcastId: string;
  note?: string;  // Optional acknowledgment note
}

export interface SubmitFeedbackRequest {
  broadcastId: string;
  feedbackType: FeedbackType;
  subject?: string;
  content: string;
  category?: string;
  allowFollowup?: boolean;
  contactMethod?: 'email' | 'in_app' | 'phone';
}

export interface BroadcastStatsResponse {
  broadcastId: string;
  totalRecipients: number;
  delivered: number;
  read: number;
  acknowledged: number;
  dismissed: number;
  feedbackCount: number;
  acknowledgmentRate: number;
  readRate: number;
}

// ============================================
// UI DISPLAY HELPERS
// ============================================

export const BROADCAST_TYPE_CONFIG: Record<BroadcastType, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  announcement: {
    label: 'Announcement',
    icon: '📢',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  alert: {
    label: 'Alert',
    icon: '🚨',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  system_notice: {
    label: 'System Notice',
    icon: '⚙️',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
  feature_release: {
    label: 'New Feature',
    icon: '✨',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  feedback_request: {
    label: 'Feedback Request',
    icon: '💬',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  pass_down: {
    label: 'Pass-Down',
    icon: '📋',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  policy_update: {
    label: 'Policy Update',
    icon: '📜',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  celebration: {
    label: 'Celebration',
    icon: '🎉',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
  },
  briefing: {
    label: 'Ops Briefing',
    icon: '◈',
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
  },
};

export const BROADCAST_PRIORITY_CONFIG: Record<BroadcastPriority, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-500',
  },
  high: {
    label: 'High',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-500',
  },
  normal: {
    label: 'Normal',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-500',
  },
  low: {
    label: 'Low',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
  },
};
