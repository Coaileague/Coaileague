const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Lock,
  FileText,
  LifeBuoy,
  RefreshCw,
} from "lucide-react";

interface ComplianceStatus {
  entityType: string;
  entityId: string;
  workspaceId: string;
  isCompliant: boolean;
  isFrozen: boolean;
  appealUsed: boolean;
  canAppeal: boolean;
  canSubmitHelpdesk: boolean;
  daysRemaining: number;
  daysSinceStart: number;
  windowDeadline: string;
  extensionDeadline: string | null;
  requiredDocTypes: string[];
  approvedDocTypes: string[];
  submittedDocTypes: string[];
  missingDocTypes: string[];
  phase: string;
}

const DOC_LABELS: Record<string, string> = {
  coi: "Certificate of Insurance (COI)",
  state_license: "State Security License",
  guard_card: "Guard Card",
  armed_guard_card: "Armed Guard Card",
  i9: "Form I-9 (Employment Eligibility)",
  w4: "Form W-4 (Tax Withholding)",
  w9: "Form W-9 (Independent Contractor)",
  training_cert: "Training Certificate",
  background_check: "Background Check",
  other: "Other Document",
};

function DocStatusRow({ docType, isApproved, isSubmitted }: { docType: string; isApproved: boolean; isSubmitted: boolean }) {
  return (
    <div className="flex items-center justify-between py-2" data-testid={`doc-row-${docType}`}>
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm">{DOC_LABELS[docType] ?? docType}</span>
      </div>
      <div>
        {isApproved ? (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Approved
          </Badge>
        ) : isSubmitted ? (
          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            Under Review
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Missing
          </Badge>
        )}
      </div>
    </div>
  );
}

function DaysBar({ daysRemaining, totalDays = 14 }: { daysRemaining: number; totalDays?: number }) {
  const pct = Math.max(0, Math.min(100, (daysRemaining / totalDays) * 100));
  const color = daysRemaining > 7 ? "bg-green-500" : daysRemaining > 3 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full bg-muted rounded-full h-2" data-testid="compliance-days-bar">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function EnforcementStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workspaceId = (user as any)?.workspaceId;

  const { data: status, isLoading, refetch } = useQuery<ComplianceStatus>({
    queryKey: ["/api/enforcement/my-status"],
    enabled: !!workspaceId,
  });

  const appealMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enforcement/appeal", {
        entityType: "organization",
        entityId: workspaceId,
        reason: "Requesting compliance extension to complete required document submissions.",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Appeal Submitted", description: "Your one-time appeal has been approved. Your deadline has been extended to the end of this month." });
      queryClient.invalidateQueries({ queryKey: ["/api/enforcement/my-status"] });
    },
    onError: () => {
      toast({ title: "Appeal Failed", description: "Could not submit appeal. Please try again or contact support.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No active compliance window found for your organization.</p>
            <p className="text-sm mt-1">Contact support if you believe this is an error.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isFullyCompliant = status.isCompliant;
  const isFrozen = status.isFrozen;
  const daysLeft = Math.max(0, status.daysRemaining);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-28 sm:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compliance Status</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your organization's compliance window status and required document checklist.
        </p>
      </div>

      {/* Status Banner */}
      <Card data-testid="compliance-status-banner">
        <CardContent className="pt-6">
          {isFullyCompliant ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">Fully Compliant</p>
                <p className="text-sm text-muted-foreground">All required documents have been reviewed and approved.</p>
              </div>
            </div>
          ) : isFrozen ? (
            <div className="flex items-start gap-3">
              <Lock className="w-8 h-8 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-700 dark:text-red-400">Account Frozen</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your account is frozen due to missing compliance documents. Shift assignments and scheduling are
                  blocked until this is resolved.
                </p>
                {status.canAppeal && (
                  <div className="mt-3">
                    <p className="text-sm font-medium mb-2">You have one appeal remaining.</p>
                    <Button
                      size="sm"
                      onClick={() => appealMutation.mutate()}
                      disabled={appealMutation.isPending}
                      data-testid="button-submit-appeal"
                    >
                      {appealMutation.isPending ? "Submitting..." : "Submit One-Time Appeal"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      Appeal auto-approves and extends your deadline to end of current month.
                    </p>
                  </div>
                )}
                {status.canSubmitHelpdesk && !status.canAppeal && (
                  <div className="mt-3 flex items-start gap-2 rounded-md bg-muted px-3 py-2">
                    <LifeBuoy className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Appeal already used</p>
                      <p className="text-sm text-muted-foreground">
                        Open a support ticket and a {PLATFORM_NAME} support staff member will review your case.
                      </p>
                      <a href="/helpdesk" className="text-sm underline underline-offset-2 mt-1 inline-block" data-testid="link-helpdesk">
                        Open Support Ticket
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-8 h-8 shrink-0 mt-0.5 ${daysLeft <= 3 ? "text-red-500" : daysLeft <= 7 ? "text-yellow-500" : "text-blue-500"}`} />
                <div>
                  <p className={`font-semibold ${daysLeft <= 3 ? "text-red-700 dark:text-red-400" : daysLeft <= 7 ? "text-yellow-700 dark:text-yellow-400" : ""}`}>
                    {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Submit all required documents before the deadline to avoid an account freeze.
                  </p>
                </div>
              </div>
              <DaysBar daysRemaining={daysLeft} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Day {status.daysSinceStart}</span>
                <span>Deadline: {new Date(status.windowDeadline).toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Required Documents
          </CardTitle>
          <CardDescription>
            {status.approvedDocTypes.length} of {status.requiredDocTypes.length} documents approved
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y" data-testid="doc-checklist">
            {status.requiredDocTypes.map((docType) => (
              <DocStatusRow
                key={docType}
                docType={docType}
                isApproved={status.approvedDocTypes.includes(docType)}
                isSubmitted={status.submittedDocTypes.includes(docType)}
              />
            ))}
          </div>

          {status.missingDocTypes.length > 0 && (
            <div className="mt-4 rounded-md bg-muted px-3 py-2">
              <p className="text-sm font-medium">Missing documents:</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {status.missingDocTypes.map((d) => DOC_LABELS[d] ?? d).join(", ")}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Upload documents through the Security Compliance section or contact your account manager.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Window Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Window Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Window deadline</span>
            <span className="font-medium">{new Date(status.windowDeadline).toLocaleDateString()}</span>
          </div>
          {status.extensionDeadline && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extended deadline</span>
              <span className="font-medium text-yellow-700 dark:text-yellow-400">{new Date(status.extensionDeadline).toLocaleDateString()}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">One-time appeal</span>
            <span className="font-medium">{status.appealUsed ? "Used" : "Available"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account status</span>
            <Badge variant="secondary" className={isFrozen ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : isFullyCompliant ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""} data-testid="account-status-badge">
              {isFrozen ? "Frozen" : isFullyCompliant ? "Active" : "Pending Docs"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
