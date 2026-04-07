import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Users,
  FileCheck,
  FileX,
  Filter,
} from "lucide-react";

interface MatrixRequirement {
  id: string;
  code: string;
  name: string;
  category: string | null;
  isCritical: boolean;
  isRequired: boolean;
  stateId: string;
}

interface MatrixCell {
  status: "complete" | "pending" | "missing" | "rejected" | "expiring";
  expirationDate: string | null;
  isExpiringSoon: boolean;
}

interface MatrixRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  role: string;
  state: string;
  complianceScore: number;
  overallStatus: string;
  cells: Record<string, MatrixCell>;
}

interface MatrixStats {
  totalEmployees: number;
  compliant: number;
  nonCompliant: number;
  partial: number;
  expiringSoon: number;
  missingDocuments: number;
  totalCells: number;
  complianceRate: number;
}

interface MatrixFilters {
  roles: string[];
  sites: string[];
  states: { id: string; code: string; name: string }[];
}

interface MatrixData {
  requirements: MatrixRequirement[];
  rows: MatrixRow[];
  stats: MatrixStats;
  filters: MatrixFilters;
}

function getCellColor(status: string): string {
  switch (status) {
    case "complete":
      return "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700";
    case "pending":
      return "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700";
    case "expiring":
      return "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700";
    case "rejected":
      return "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700";
    case "missing":
      return "bg-muted/50 border-muted";
    default:
      return "bg-muted/50 border-muted";
  }
}

function getCellIcon(status: string) {
  switch (status) {
    case "complete":
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "pending":
      return <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case "expiring":
      return <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
    case "rejected":
      return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case "missing":
      return <FileX className="h-4 w-4 text-muted-foreground" />;
    default:
      return <FileX className="h-4 w-4 text-muted-foreground" />;
  }
}

function getCellLabel(status: string): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "pending":
      return "Pending Review";
    case "expiring":
      return "Expiring Soon";
    case "rejected":
      return "Rejected";
    case "missing":
      return "Missing";
    default:
      return "Unknown";
  }
}

export default function ComplianceMatrix() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedSite, setSelectedSite] = useState<string>("all");

  const queryParams = new URLSearchParams();
  if (selectedState !== "all") queryParams.set("stateCode", selectedState);
  if (selectedRole !== "all") queryParams.set("role", selectedRole);
  if (selectedSite !== "all") queryParams.set("site", selectedSite);
  const qs = queryParams.toString();

  const { data, isLoading } = useQuery<{ success: boolean; matrix: MatrixData }>({
    queryKey: ["/api/security-compliance/matrix", qs],
    queryFn: async () => {
      const url = `/api/security-compliance/matrix${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matrix");
      return res.json();
    },
  });

  const matrix = data?.matrix;
  const stats = matrix?.stats;
  const requirements = matrix?.requirements || [];
  const filters = matrix?.filters;

  const filteredRows = useMemo(() => {
    if (!matrix?.rows) return [];
    if (!searchTerm) return matrix.rows;
    const term = searchTerm.toLowerCase();
    return matrix.rows.filter(
      (r) =>
        r.firstName.toLowerCase().includes(term) ||
        r.lastName.toLowerCase().includes(term) ||
        r.role.toLowerCase().includes(term)
    );
  }, [matrix?.rows, searchTerm]);

  const pageConfig: CanvasPageConfig = {
    id: "compliance-matrix",
    title: "Compliance Matrix",
    subtitle: "Employee vs Document Requirements Overview",
    category: "operations",
    maxWidth: "full",
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="space-y-4" data-testid="compliance-matrix-page">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="stat-total-employees">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold" data-testid="text-total-employees">
                {isLoading ? "..." : stats?.totalEmployees ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-compliant">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Fully Compliant</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-compliant">
                {isLoading ? "..." : stats?.compliant ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.complianceRate ?? 0}% rate
              </p>
            </CardContent>
          </Card>

          <Card data-testid="stat-partial">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Partially Compliant</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-partial">
                {isLoading ? "..." : stats?.partial ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="stat-non-compliant">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
              <CardTitle className="text-sm font-medium">Non-Compliant</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-non-compliant">
                {isLoading ? "..." : stats?.nonCompliant ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.missingDocuments ?? 0} missing docs
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-employees"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger className="w-[160px]" data-testid="select-state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {filters?.states.map((s) => (
                    <SelectItem key={s.id} value={s.code}>
                      {s.code} - {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-[160px]" data-testid="select-role-filter">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {filters?.roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[160px]" data-testid="select-site-filter">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {filters?.sites.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" />
                <span className="text-xs text-muted-foreground">Complete</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700" />
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700" />
                <span className="text-xs text-muted-foreground">Expiring</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700" />
                <span className="text-xs text-muted-foreground">Rejected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-sm bg-muted/50 border border-muted" />
                <span className="text-xs text-muted-foreground">Missing</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
                  <p className="text-muted-foreground">Loading compliance matrix...</p>
                </div>
              </div>
            ) : filteredRows.length === 0 && requirements.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <FileCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground font-medium">No compliance data available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add employees and configure state requirements to see the compliance matrix.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="compliance-matrix-table">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium sticky left-0 bg-card z-10 min-w-[200px]">
                        Employee
                      </th>
                      <th className="text-center p-3 font-medium min-w-[80px]">Score</th>
                      {requirements.map((req) => (
                        <th
                          key={req.id}
                          className="text-center p-2 font-medium min-w-[100px]"
                          data-testid={`header-req-${req.code}`}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col items-center gap-1 cursor-help">
                                <span className="text-xs truncate max-w-[90px]">{req.code}</span>
                                {req.isCritical && (
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                    Critical
                                  </Badge>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p className="font-medium">{req.name}</p>
                              {req.category && (
                                <p className="text-xs text-muted-foreground">{req.category}</p>
                              )}
                              <p className="text-xs">
                                {req.isRequired ? "Required" : "Optional"}
                                {req.isCritical ? " - Critical" : ""}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr
                        key={row.employeeId}
                        className="border-b last:border-0 hover-elevate"
                        data-testid={`matrix-row-${row.employeeId}`}
                      >
                        <td className="p-3 sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium shrink-0">
                              {row.firstName.charAt(0)}
                              {row.lastName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate" data-testid={`text-employee-name-${row.employeeId}`}>
                                {row.firstName} {row.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {row.role}
                                {row.state ? ` - ${row.state}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Badge
                            variant={
                              row.overallStatus === "complete"
                                ? "default"
                                : row.complianceScore > 50
                                ? "secondary"
                                : "destructive"
                            }
                            data-testid={`badge-score-${row.employeeId}`}
                          >
                            {row.complianceScore}%
                          </Badge>
                        </td>
                        {requirements.map((req) => {
                          const cell = row.cells[req.id] || {
                            status: "missing",
                            expirationDate: null,
                            isExpiringSoon: false,
                          };
                          return (
                            <td key={req.id} className="p-2 text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`flex items-center justify-center h-8 w-8 mx-auto rounded-md border cursor-help ${getCellColor(cell.status)}`}
                                    data-testid={`cell-${row.employeeId}-${req.code}`}
                                  >
                                    {getCellIcon(cell.status)}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="font-medium">
                                    {row.firstName} {row.lastName}
                                  </p>
                                  <p className="text-xs">{req.name}</p>
                                  <p className="text-xs font-medium mt-1">
                                    Status: {getCellLabel(cell.status)}
                                  </p>
                                  {cell.expirationDate && (
                                    <p className="text-xs text-muted-foreground">
                                      Expires:{" "}
                                      {new Date(cell.expirationDate).toLocaleDateString()}
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </CanvasHubPage>
  );
}
