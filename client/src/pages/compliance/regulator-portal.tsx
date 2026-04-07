const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || 'CoAIleague';
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  MapPin,
  Clock,
  Loader2,
  Lock,
} from "lucide-react";
import { WFLogoCompact } from "@/components/wf-logo";

interface RegulatorAccess {
  regulatorName: string;
  regulatorOrganization: string;
  stateCode: string;
  stateName: string;
  regulatoryBody: string;
  regulatoryBodyAcronym: string;
  accessLevel: string;
  expiresAt: string;
  canExportDocuments: boolean;
  canGeneratePackets: boolean;
}

interface EmployeeRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  complianceScore: number | null;
  overallStatus: string | null;
  vaultLocked: boolean | null;
  totalRequirements: number | null;
  completedRequirements: number | null;
}

interface PortalData {
  success: boolean;
  access: RegulatorAccess;
  employees: EmployeeRecord[];
}

function getStatusBadge(status: string | null) {
  switch (status) {
    case "compliant":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="status-compliant">Compliant</Badge>;
    case "non_compliant":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="status-noncompliant">Non-Compliant</Badge>;
    case "pending":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="status-pending">Pending</Badge>;
    default:
      return <Badge variant="secondary" data-testid="status-unknown">Unknown</Badge>;
  }
}

export default function RegulatorPortalPage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ['/api/security-compliance/regulator/portal', token],
    queryFn: async () => {
      const res = await fetch(`/api/security-compliance/regulator/portal/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Access denied: ${res.status}`);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="loading-regulator-portal">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Validating access...</p>
        </div>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="error-regulator-portal">
        <Card className="max-w-sm w-full mx-4">
          <CardHeader className="text-center">
            <Lock className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              {error?.message || "This access link is invalid or has expired. Contact the organization for a new access link."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { access, employees } = data;
  const compliantCount = employees.filter(e => e.overallStatus === 'compliant').length;
  const complianceRate = employees.length > 0 ? Math.round((compliantCount / employees.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background" data-testid="regulator-portal">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <WFLogoCompact className="h-8 w-8" />
            <div>
              <p className="text-xs text-muted-foreground">Regulatory Compliance Portal</p>
              <p className="font-semibold text-sm">{access.regulatoryBodyAcronym || access.regulatoryBody}</p>
            </div>
          </div>
          <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-access-level">
            <Shield className="h-3 w-3" />
            {access.accessLevel === 'full' ? 'Full Access' : 'Limited Access'}
          </Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-28 sm:pb-10 space-y-6">
        <Card data-testid="card-portal-info">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              Portal Access Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Regulator</p>
                <p className="font-medium text-sm" data-testid="text-regulator-name">{access.regulatorName}</p>
                <p className="text-xs text-muted-foreground">{access.regulatorOrganization}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />State</p>
                <p className="font-medium text-sm" data-testid="text-state">{access.stateName} ({access.stateCode})</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Regulatory Body</p>
                <p className="font-medium text-sm">{access.regulatoryBody}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Access Expires</p>
                <p className="font-medium text-sm" data-testid="text-expires">
                  {new Date(access.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card data-testid="card-total-employees">
            <CardContent className="p-3 sm:pt-6 sm:px-6 text-center sm:text-left">
              <p className="text-xl sm:text-2xl font-bold">{employees.length}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card data-testid="card-compliant-employees">
            <CardContent className="p-3 sm:pt-6 sm:px-6 text-center sm:text-left">
              <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{compliantCount}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Compliant</p>
            </CardContent>
          </Card>
          <Card data-testid="card-compliance-rate">
            <CardContent className="p-3 sm:pt-6 sm:px-6 text-center sm:text-left">
              <p className="text-xl sm:text-2xl font-bold">{complianceRate}%</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Rate</p>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-employee-records">
          <CardHeader>
            <CardTitle>Employee Compliance Records</CardTitle>
            <CardDescription>{employees.length} employees authorized for review</CardDescription>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="empty-employees">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                <p>No employee records authorized for this access session.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Compliance Score</TableHead>
                    <TableHead>Requirements</TableHead>
                    <TableHead>Vault</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow key={emp.id} data-testid={`row-employee-${emp.id}`}>
                      <TableCell className="font-medium">
                        {emp.firstName} {emp.lastName}
                      </TableCell>
                      <TableCell>{getStatusBadge(emp.overallStatus)}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{emp.complianceScore ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        {emp.completedRequirements ?? 0} / {emp.totalRequirements ?? 0}
                      </TableCell>
                      <TableCell>
                        {emp.vaultLocked ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" /> Open
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground pb-4" data-testid="text-portal-footer">
          This portal is provided by {PLATFORM_NAME} in compliance with regulatory access requirements.
          Access is logged and monitored. Unauthorized use is prohibited.
        </p>
      </main>
    </div>
  );
}
