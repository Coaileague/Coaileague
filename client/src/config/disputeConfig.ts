/**
 * Dispute Resolution Configuration
 * 
 * Universal dynamic configuration for all dispute-related settings.
 * Zero hardcoded values - everything is configurable from this single source.
 */

export const disputeTypesConfig = {
  performance_review: {
    label: 'Performance Review Dispute',
    targetType: 'performance_reviews',
    description: 'Challenge an unfair performance review rating',
  },
  employer_rating: {
    label: 'Employer Rating Dispute',
    targetType: 'employer_ratings',
    description: 'Dispute an employer\'s rating of your work',
  },
  report: {
    label: 'Report Dispute',
    targetType: 'reports',
    description: 'Challenge inaccurate data or findings in a report',
  },
  composite_score: {
    label: 'Composite Score Dispute',
    targetType: 'composite_scores',
    description: 'Dispute your calculated composite score',
  },
} as const;

export const disputeStatusConfig = {
  pending: {
    label: 'Pending',
    icon: 'Clock',
    description: 'Awaiting initial review',
    severity: 'info',
    bgColor: 'bg-yellow-500/10',
    textColor: 'text-yellow-500',
    borderColor: 'border-yellow-500/20',
  },
  under_review: {
    label: 'Under Review',
    icon: 'Eye',
    description: 'Being actively reviewed by management',
    severity: 'warning',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
    borderColor: 'border-blue-500/20',
  },
  resolved: {
    label: 'Resolved',
    icon: 'CheckCircle',
    description: 'Dispute has been resolved',
    severity: 'success',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-500',
    borderColor: 'border-green-500/20',
  },
  rejected: {
    label: 'Rejected',
    icon: 'AlertCircle',
    description: 'Dispute was not upheld',
    severity: 'destructive',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-500',
    borderColor: 'border-red-500/20',
  },
  appealed: {
    label: 'Appealed',
    icon: 'Scale',
    description: 'Decision is being appealed',
    severity: 'warning',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-500',
    borderColor: 'border-purple-500/20',
  },
} as const;

export const disputePriorityConfig = {
  low: {
    label: 'Low',
    bgColor: 'bg-gray-500/10',
    textColor: 'text-gray-500',
    borderColor: 'border-gray-500/20',
    description: 'Minor discrepancies',
  },
  normal: {
    label: 'Normal',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500',
    borderColor: 'border-blue-500/20',
    description: 'Standard disputes',
  },
  high: {
    label: 'High',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-500',
    borderColor: 'border-orange-500/20',
    description: 'Significant impact',
  },
  urgent: {
    label: 'Urgent',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-500',
    borderColor: 'border-red-500/20',
    description: 'Critical issues requiring immediate attention',
  },
} as const;

export const disputeMessages = {
  title: 'Dispute Management',
  subtitle: 'Fair employee/employer transparency system',
  fileButton: 'File New Dispute',
  fileDialogTitle: 'File a Dispute',
  fileDialogDescription: 'Submit a formal dispute for a performance review, employer rating, report, or composite score.',
  addSuccess: 'Dispute filed successfully',
  addError: 'Failed to file dispute',
  deleteSuccess: 'Dispute deleted successfully',
  deleteError: 'Failed to delete dispute',
  updateSuccess: 'Dispute updated successfully',
  updateError: 'Failed to update dispute',
  noDisputes: 'No disputes found',
  selectDispute: 'Select a dispute to view details and AI analysis',
  aiAnalysis: 'AI Analysis & Summary',
  aiSummary: 'AI Summary',
  confidence: 'Confidence Score',
  recommendations: 'Recommendations',
  viewMore: 'View More',
  filterAll: 'All Disputes',
};

export const disputeValidation = {
  title: {
    minLength: 10,
    maxLength: 200,
  },
  reason: {
    minLength: 20,
    maxLength: 1000,
  },
  evidence: {
    maxItems: 10,
    maxFileSize: 10485760, // 10MB
  },
  requestedOutcome: {
    minLength: 10,
    maxLength: 500,
  },
};

export const aiDisputeAnalysisConfig = {
  enabled: true,
  confidenceThresholds: {
    high: 0.8,
    medium: 0.6,
    low: 0.4,
  },
  maxSummaryLength: 500,
  maxRecommendationsLength: 1000,
};
