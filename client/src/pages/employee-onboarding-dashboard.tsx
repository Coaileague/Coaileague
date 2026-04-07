import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Shield,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Users,
  FileText,
  Calendar,
  Bell,
  ChevronRight,
  Ban,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from '@/components/canvas-hub';
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays } from "date-fns";

interface DocumentRequirementStatus {
  requirement: {
    id: string;
    documentType: string;
    name: string;
    description: string;
    category: string;
    priority: string;
    blocksWorkAssignment: boolean;
  };
  status: string;
  documentId?: string;
  uploadedAt?: string;
  expirationDate?: string;
  daysUntilExpiration?: number;
  rejectionReason?: string;
}

interface EmployeeOnboardingStatus {
  employeeId: string;
  employeeName: string;
  position: string;
  isWorkEligible: boolean;
  completionPercentage: number;
  criticalDocumentsMissing: number;
  totalDocumentsRequired: number;
  totalDocumentsCompleted: number;
  documentStatuses: DocumentRequirementStatus[];
  blockedReasons: string[];
  nextExpiringDocument?: {
    name: string;
    expirationDate: string;
    daysUntilExpiration: number;
  };
}

interface WorkspaceOnboardingOverview {
  workspaceId: string;
  totalEmployees: number;
  eligibleEmployees: number;
  blockedEmployees: number;
  pendingDocuments: number;
  expiringWithin30Days: number;
  employeeStatuses: EmployeeOnboardingStatus[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  not_started: { label: "Not Started", color: "secondary", icon: Clock },
  uploaded: { label: "Uploaded", color: "outline", icon: FileText },
  pending_review: { label: "Pending Review", color: "secondary", icon: Clock },
  approved: { label: "Approved", color: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "destructive", icon: XCircle },
  expired: { label: "Expired", color: "destructive", icon: AlertTriangle },
};

const CATEGORY_LABELS: Record<string, string> = {
  licensing: "Licensing",
  training: "Training",
  background: "Background Check",
  compliance: "Compliance",
  identification: "Identification",
};

const POSITION_LABELS: Record<string, string> = {
  unarmed_guard: "Unarmed Guard",
  armed_guard: "Armed Guard",
  supervisor: "Supervisor",
  site_manager: "Site Manager",
};

function OnboardingOverviewCards({ overview }: { overview: WorkspaceOnboardingOverview }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card data-testid="card-total-employees">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-xl sm:text-2xl font-bold">{overview.totalEmployees}</div>
          <p className="text-xs text-muted-foreground">Across all positions</p>
        </CardContent>
      </Card>

      <Card data-testid="card-eligible-employees">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Work Eligible</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-xl sm:text-2xl font-bold text-green-600">{overview.eligibleEmployees}</div>
          <p className="text-xs text-muted-foreground">Can be assigned to shifts</p>
        </CardContent>
      </Card>

      <Card data-testid="card-blocked-employees">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Work Blocked</CardTitle>
          <Ban className="h-4 w-4 text-destructive shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-xl sm:text-2xl font-bold text-destructive">{overview.blockedEmployees}</div>
          <p className="text-xs text-muted-foreground">Missing critical documents</p>
        </CardContent>
      </Card>

      <Card data-testid="card-expiring-documents">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
          <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-xl sm:text-2xl font-bold text-yellow-600">{overview.expiringWithin30Days}</div>
          <p className="text-xs text-muted-foreground">Within 30 days</p>
        </CardContent>
      </Card>
    </div>
  );
}

function EmployeeOnboardingCard({ 
  employee, 
  onNotify 
}: { 
  employee: EmployeeOnboardingStatus;
  onNotify: (employeeId: string) => void;
}) {
  const criticalDocs = employee.documentStatuses.filter(
    d => d.requirement.priority === 'critical' && d.status !== 'approved'
  );
  const highPriorityDocs = employee.documentStatuses.filter(
    d => d.requirement.priority === 'high' && d.status !== 'approved'
  );

  return (
    <Card className="hover-elevate" data-testid={`card-employee-onboarding-${employee.employeeId}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback>{employee.employeeName.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{employee.employeeName}</CardTitle>
              <CardDescription className="truncate">{POSITION_LABELS[employee.position] || employee.position}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {employee.isWorkEligible ? (
              <Badge variant="default" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Work Eligible
              </Badge>
            ) : (
              <Badge variant="destructive" className="flex items-center gap-1">
                <Ban className="h-3 w-3" />
                Work Blocked
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between gap-2 text-sm">
            <span>Document Completion</span>
            <span className="font-medium">{employee.completionPercentage}%</span>
          </div>
          <Progress value={employee.completionPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {employee.totalDocumentsCompleted} of {employee.totalDocumentsRequired} documents completed
          </p>
        </div>

        {employee.blockedReasons.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Work Assignment Blocked</AlertTitle>
            <AlertDescription className="text-xs break-words">
              {employee.blockedReasons.slice(0, 3).join(', ')}
              {employee.blockedReasons.length > 3 && ` +${employee.blockedReasons.length - 3} more`}
            </AlertDescription>
          </Alert>
        )}

        {employee.nextExpiringDocument && employee.nextExpiringDocument.daysUntilExpiration <= 30 && (
          <Alert>
            <Calendar className="h-4 w-4" />
            <AlertTitle>Document Expiring Soon</AlertTitle>
            <AlertDescription className="text-xs">
              {employee.nextExpiringDocument.name} expires in {employee.nextExpiringDocument.daysUntilExpiration} days
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-1">
          {criticalDocs.slice(0, 3).map(doc => (
            <Badge key={doc.requirement.id} variant="destructive" className="text-xs">
              {doc.requirement.name}
            </Badge>
          ))}
          {highPriorityDocs.slice(0, 2).map(doc => (
            <Badge key={doc.requirement.id} variant="secondary" className="text-xs">
              {doc.requirement.name}
            </Badge>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onNotify(employee.employeeId)}
            data-testid={`button-notify-${employee.employeeId}`}
          >
            <Bell className="h-4 w-4 mr-1" />
            Remind
          </Button>
          <Link href={`/employees/${employee.employeeId}/file-cabinet`}>
            <Button variant="default" size="sm" data-testid={`button-view-docs-${employee.employeeId}`}>
              <FileText className="h-4 w-4 mr-1" />
              View Docs
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentStatusList({ statuses }: { statuses: DocumentRequirementStatus[] }) {
  const groupedByCategory = statuses.reduce((acc, status) => {
    const cat = status.requirement.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(status);
    return acc;
  }, {} as Record<string, DocumentRequirementStatus[]>);

  return (
    <div className="space-y-6">
      {Object.entries(groupedByCategory).map(([category, docs]) => (
        <div key={category}>
          <h4 className="font-medium text-sm mb-3 text-muted-foreground">
            {CATEGORY_LABELS[category] || category}
          </h4>
          <div className="space-y-2">
            {docs.map(doc => {
              const StatusIcon = STATUS_CONFIG[doc.status]?.icon || Clock;
              return (
                <div 
                  key={doc.requirement.id}
                  className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-md"
                  data-testid={`doc-status-${doc.requirement.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon className={`h-4 w-4 shrink-0 ${
                      doc.status === 'approved' ? 'text-green-600' :
                      doc.status === 'rejected' || doc.status === 'expired' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.requirement.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.requirement.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.requirement.blocksWorkAssignment && doc.status !== 'approved' && (
                      <Badge variant="outline" className="text-xs border-destructive text-destructive">
                        Required
                      </Badge>
                    )}
                    <Badge variant={STATUS_CONFIG[doc.status]?.color as any || "outline"}>
                      {STATUS_CONFIG[doc.status]?.label || doc.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EmployeeOnboardingDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const workspaceId = user?.workspaceId;

  const { data: overview, isLoading } = useQuery<WorkspaceOnboardingOverview>({
    queryKey: ['/api/employee-onboarding/workspace', workspaceId, 'overview'],
    enabled: !!workspaceId,
  });

  const notifyMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      return apiRequest('POST', `/api/employee-onboarding/${employeeId}/notify`);
    },
    onSuccess: () => {
      toast({
        title: "Reminder Sent",
        description: "The employee has been notified about missing documents.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send reminder. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredEmployees = overview?.employeeStatuses?.filter(emp => {
    const matchesSearch = emp.employeeName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === 'all' || 
      (activeTab === 'blocked' && !emp.isWorkEligible) ||
      (activeTab === 'eligible' && emp.isWorkEligible) ||
      (activeTab === 'expiring' && emp.nextExpiringDocument && emp.nextExpiringDocument.daysUntilExpiration <= 30);
    return matchesSearch && matchesTab;
  }) || [];

  const pageConfig: CanvasPageConfig = {
    id: 'employee-onboarding-dashboard',
    title: 'Employee Onboarding',
    subtitle: 'Document compliance and work eligibility tracking',
    category: 'operations',
  };

  if (isLoading) {
    return (
      <CanvasHubPage config={pageConfig}>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </CanvasHubPage>
    );
  }

  if (!overview) {
    return (
      <CanvasHubPage config={pageConfig}>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Data Available</AlertTitle>
          <AlertDescription>
            Unable to load onboarding data. Please ensure you have the correct permissions.
          </AlertDescription>
        </Alert>
      </CanvasHubPage>
    );
  }

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-6">
        <OnboardingOverviewCards overview={overview} />

        {/* Quick Actions */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Link href="/onboarding-forms">
            <Button variant="default" data-testid="button-open-onboarding-forms">
              <FileText className="w-4 h-4 mr-2" />
              Complete Onboarding Packet
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-employees"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="all" data-testid="tab-all">
              All ({overview.totalEmployees})
            </TabsTrigger>
            <TabsTrigger value="blocked" data-testid="tab-blocked">
              Work Blocked ({overview.blockedEmployees})
            </TabsTrigger>
            <TabsTrigger value="eligible" data-testid="tab-eligible">
              Work Eligible ({overview.eligibleEmployees})
            </TabsTrigger>
            <TabsTrigger value="expiring" data-testid="tab-expiring">
              Expiring ({overview.expiringWithin30Days})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {filteredEmployees.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No employees match your filter criteria.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEmployees.map(employee => (
                  <EmployeeOnboardingCard
                    key={employee.employeeId}
                    employee={employee}
                    onNotify={(id) => notifyMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
