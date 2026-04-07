import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UniversalEmptyState } from "@/components/universal";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Shield,
  FileCheck,
  AlertTriangle,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  FileText,
  Upload,
  Camera,
  Fingerprint,
  BookOpen,
  Heart,
  Crosshair,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface DocumentRequirement {
  id: string;
  documentType: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  blocksWorkAssignment: boolean;
  regulatoryCitation?: string;
}

interface DocumentStatus {
  requirement: DocumentRequirement;
  status: 'not_started' | 'uploaded' | 'pending_review' | 'approved' | 'rejected' | 'expired';
  documentId?: string;
  uploadedAt?: string;
  expirationDate?: string;
  daysUntilExpiration?: number;
  rejectionReason?: string;
}

interface OnboardingDeadline {
  hireDate: string;
  deadlineDate: string;
  daysRemaining: number;
  daysElapsed: number;
  isOverdue: boolean;
  urgencyLevel: 'on_track' | 'warning' | 'critical' | 'overdue';
}

interface EmployeeOnboardingStatus {
  employeeId: string;
  employeeName: string;
  position: string;
  workState: string;
  isWorkEligible: boolean;
  completionPercentage: number;
  criticalDocumentsMissing: number;
  totalDocumentsRequired: number;
  totalDocumentsCompleted: number;
  documentStatuses: DocumentStatus[];
  blockedReasons: string[];
  onboardingDeadline?: OnboardingDeadline;
  onboardingStatus: string;
  nextExpiringDocument?: {
    name: string;
    expirationDate: string;
    daysUntilExpiration: number;
  };
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Shield }> = {
  licensing: { label: "Licensing", icon: Shield },
  training: { label: "Training", icon: BookOpen },
  background: { label: "Background Check", icon: Fingerprint },
  compliance: { label: "Compliance", icon: FileCheck },
  identification: { label: "Identification", icon: Camera },
  medical: { label: "Medical", icon: Heart },
  firearms: { label: "Firearms", icon: Crosshair },
};

function getStatusIcon(status: DocumentStatus['status']) {
  switch (status) {
    case 'approved':
      return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />;
    case 'pending_review':
      return <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />;
    case 'rejected':
      return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />;
    case 'expired':
      return <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />;
    case 'uploaded':
      return <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />;
    default:
      return <FileText className="h-5 w-5 text-muted-foreground shrink-0" />;
  }
}

function getStatusBadge(status: DocumentStatus['status']) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-status-approved">Approved</Badge>;
    case 'pending_review':
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="badge-status-pending">Pending Review</Badge>;
    case 'rejected':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-status-rejected">Rejected</Badge>;
    case 'expired':
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-status-expired">Expired</Badge>;
    case 'uploaded':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid="badge-status-uploaded">Uploaded</Badge>;
    default:
      return <Badge variant="secondary" data-testid="badge-status-not-started">Not Started</Badge>;
  }
}

function CategorySection({
  category,
  documents,
}: {
  category: string;
  documents: DocumentStatus[];
}) {
  const [isOpen, setIsOpen] = useState(true);
  const config = CATEGORY_CONFIG[category] || { label: category, icon: FileText };
  const CategoryIcon = config.icon;
  const completedCount = documents.filter(
    (d) => d.status === 'approved'
  ).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-testid={`category-section-${category}`}>
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full items-center justify-between gap-2 rounded-md border p-3 min-h-[44px] hover-elevate"
          data-testid={`button-toggle-${category}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">{config.label}</span>
            <Badge variant="secondary" data-testid={`badge-progress-${category}`}>
              {completedCount} of {documents.length} complete
            </Badge>
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {documents.map((docStatus) => (
            <DocumentRow key={docStatus.requirement.id} docStatus={docStatus} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DocumentRow({ docStatus }: { docStatus: DocumentStatus }) {
  const { requirement, status, rejectionReason, daysUntilExpiration } = docStatus;
  const isExpiringSoon = daysUntilExpiration !== undefined && daysUntilExpiration <= 30 && status !== 'expired';

  return (
    <Card data-testid={`document-row-${requirement.id}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {getStatusIcon(status)}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm" data-testid={`text-doc-name-${requirement.id}`}>
                  {requirement.name}
                </span>
                {requirement.blocksWorkAssignment && (
                  <Badge variant="destructive" className="text-xs" data-testid={`badge-blocks-work-${requirement.id}`}>
                    Blocks Work
                  </Badge>
                )}
              </div>
              <div className="shrink-0">
                {getStatusBadge(status)}
              </div>
            </div>
            {requirement.description && (
              <p className="text-xs text-muted-foreground" data-testid={`text-doc-desc-${requirement.id}`}>
                {requirement.description}
              </p>
            )}
            {requirement.regulatoryCitation && (
              <p className="text-xs text-muted-foreground italic" data-testid={`text-citation-${requirement.id}`}>
                {requirement.regulatoryCitation}
              </p>
            )}
            {status === 'rejected' && rejectionReason && (
              <div className="flex items-start gap-1 mt-1 p-2 rounded-md bg-red-50 dark:bg-red-950/30">
                <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-300" data-testid={`text-rejection-${requirement.id}`}>
                  {rejectionReason}
                </p>
              </div>
            )}
            {isExpiringSoon && (
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400" data-testid={`text-expiring-${requirement.id}`}>
                  Expires in {daysUntilExpiration} day{daysUntilExpiration !== 1 ? 's' : ''}
                </p>
              </div>
            )}
            {status === 'not_started' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-[44px] sm:min-h-0"
                data-testid={`button-upload-${requirement.id}`}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function EmployeeOnboardingPacket() {
  const { data, isLoading } = useQuery<{ success: boolean; status: EmployeeOnboardingStatus }>({
    queryKey: ['/api/security-compliance/enforcement/onboarding-status'],
  });

  const pageConfig: CanvasPageConfig = {
    id: 'employee-onboarding-packet',
    title: 'Onboarding Packet',
    subtitle: 'Track and complete your required documents',
    category: 'operations',
    maxWidth: '4xl',
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="flex justify-center items-center py-12" data-testid="loading-state">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CanvasHubPage>
    );
  }

  const status = data?.status;

  if (!status) {
    return (
      <CanvasHubPage config={pageConfig}>
        <UniversalEmptyState
          icon={<Users size={32} />}
          title="No Onboarding Information"
          description="No onboarding information found. Contact your administrator if you believe this is an error."
          data-testid="empty-state"
        />
      </CanvasHubPage>
    );
  }

  const categorizedDocs = status.documentStatuses.reduce<Record<string, DocumentStatus[]>>(
    (acc, docStatus) => {
      const cat = docStatus.requirement.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(docStatus);
      return acc;
    },
    {}
  );

  const categoryOrder = ['licensing', 'identification', 'background', 'training', 'compliance', 'medical', 'firearms'];
  const sortedCategories = Object.keys(categorizedDocs).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4" data-testid="onboarding-packet">
        <div className="sticky top-0 z-50 -mx-1 px-1 pb-2 pt-1 bg-background/95 backdrop-blur-sm" data-testid="completion-header">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-semibold text-base" data-testid="text-employee-name">
                      {status.employeeName}
                    </h2>
                    {status.isWorkEligible ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-work-eligible">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Work Eligible
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-not-eligible">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Not Eligible
                      </Badge>
                    )}
                  </div>
                  {status.position && (
                    <p className="text-sm text-muted-foreground" data-testid="text-position">
                      {status.position}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <Progress value={status.completionPercentage} className="flex-1" data-testid="progress-completion" />
                    <span className="text-sm font-medium shrink-0" data-testid="text-completion-pct">
                      {status.completionPercentage}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1" data-testid="text-doc-count">
                    {status.totalDocumentsCompleted} of {status.totalDocumentsRequired} documents completed
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {status.onboardingDeadline && (
          <Card
            className={
              status.onboardingDeadline.urgencyLevel === 'overdue'
                ? 'border-red-400 dark:border-red-700'
                : status.onboardingDeadline.urgencyLevel === 'critical'
                ? 'border-red-300 dark:border-red-800'
                : status.onboardingDeadline.urgencyLevel === 'warning'
                ? 'border-amber-300 dark:border-amber-800'
                : 'border-green-300 dark:border-green-800'
            }
            data-testid="card-onboarding-deadline"
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Clock
                  className={`h-5 w-5 shrink-0 ${
                    status.onboardingDeadline.isOverdue
                      ? 'text-red-500'
                      : status.onboardingDeadline.urgencyLevel === 'critical'
                      ? 'text-red-400'
                      : status.onboardingDeadline.urgencyLevel === 'warning'
                      ? 'text-amber-500'
                      : 'text-green-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" data-testid="text-deadline-title">
                      15-Day Onboarding Deadline
                    </span>
                    {status.onboardingDeadline.isOverdue ? (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="badge-deadline-overdue">
                        Overdue
                      </Badge>
                    ) : status.onboardingDeadline.urgencyLevel === 'critical' ? (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300" data-testid="badge-deadline-critical">
                        Critical
                      </Badge>
                    ) : status.onboardingDeadline.urgencyLevel === 'warning' ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid="badge-deadline-warning">
                        Due Soon
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="badge-deadline-on-track">
                        On Track
                      </Badge>
                    )}
                    {status.workState && (
                      <Badge variant="secondary" data-testid="badge-work-state">
                        {status.workState}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-col sm:flex-row sm:items-center sm:gap-4 text-xs text-muted-foreground">
                    <span data-testid="text-hire-date">
                      Hired: {new Date(status.onboardingDeadline.hireDate).toLocaleDateString()}
                    </span>
                    <span data-testid="text-deadline-date">
                      Deadline: {new Date(status.onboardingDeadline.deadlineDate).toLocaleDateString()}
                    </span>
                    <span
                      className={`font-medium ${
                        status.onboardingDeadline.isOverdue
                          ? 'text-red-600 dark:text-red-400'
                          : status.onboardingDeadline.urgencyLevel === 'critical'
                          ? 'text-red-500 dark:text-red-400'
                          : status.onboardingDeadline.urgencyLevel === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                      data-testid="text-days-remaining"
                    >
                      {status.onboardingDeadline.isOverdue
                        ? `${Math.abs(status.onboardingDeadline.daysRemaining)} day${Math.abs(status.onboardingDeadline.daysRemaining) !== 1 ? 's' : ''} overdue`
                        : `${status.onboardingDeadline.daysRemaining} day${status.onboardingDeadline.daysRemaining !== 1 ? 's' : ''} remaining`}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (status.onboardingDeadline.daysElapsed / 15) * 100)}
                    className="mt-2"
                    data-testid="progress-deadline"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!status.isWorkEligible && status.blockedReasons.length > 0 && (
          <Card className="border-red-300 dark:border-red-800" data-testid="card-blocked-reasons">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Cannot Be Assigned to Work
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {status.blockedReasons.map((reason, i) => (
                  <li key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2" data-testid={`text-blocked-reason-${i}`}>
                    <XCircle className="h-3 w-3 mt-1 shrink-0" />
                    {reason}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {status.nextExpiringDocument && status.nextExpiringDocument.daysUntilExpiration <= 30 && (
          <Card className="border-amber-300 dark:border-amber-800" data-testid="card-expiring-warning">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300" data-testid="text-expiring-doc-name">
                  {status.nextExpiringDocument.name} expiring soon
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-expiring-doc-days">
                  Expires in {status.nextExpiringDocument.daysUntilExpiration} day{status.nextExpiringDocument.daysUntilExpiration !== 1 ? 's' : ''} ({new Date(status.nextExpiringDocument.expirationDate).toLocaleDateString()})
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {status.criticalDocumentsMissing > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900" data-testid="banner-critical-missing">
            <Shield className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {status.criticalDocumentsMissing} critical document{status.criticalDocumentsMissing !== 1 ? 's' : ''} missing
            </p>
          </div>
        )}

        <div className="space-y-3" data-testid="document-categories">
          {sortedCategories.map((category) => (
            <CategorySection
              key={category}
              category={category}
              documents={categorizedDocs[category]}
            />
          ))}
        </div>
      </div>
    </CanvasHubPage>
  );
}
