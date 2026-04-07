import { useState } from "react";
import { secureFetch } from "@/lib/csrf";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UniversalModal, UniversalModalDescription, UniversalModalFooter, UniversalModalHeader, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useModules } from "@/config/moduleConfig";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Plus, Calendar, Users, Target, BarChart3, PieChart, LineChart,
  FileText, Download, Upload, Settings, Edit, Trash2, Eye,
  ArrowUpRight, ArrowDownRight, Wallet, CreditCard, Building2
} from "lucide-react";
import { MetricsCardsSkeleton, TableSkeleton } from "@/components/loading-indicators/skeletons";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

interface Budget {
  id: string;
  name: string;
  department: string;
  period: string;
  totalAmount: number;
  spent: number;
  remaining: number;
  status: "on_track" | "warning" | "over_budget";
  owner: string;
}

interface BudgetLine {
  id: string;
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
}

function ForecastDashboard() {
  const { data, isLoading } = useQuery<{ historical: any[]; projected: any[]; summary: any }>({
    queryKey: ['/api/analytics/forecast'],
  });

  if (isLoading) return <div className="py-16 text-center text-muted-foreground text-sm">Loading forecast data...</div>;

  const allPoints = [
    ...(data?.historical || []).map((h: any) => ({ ...h, type: 'historical' })),
    ...(data?.projected || []).map((p: any) => ({ ...p, type: 'projected' })),
  ];

  const fmt = (n: number) => n >= 1000000
    ? `$${(n / 1000000).toFixed(1)}M`
    : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;

  const fmtMonth = (m: string) => {
    const [yr, mo] = m.split('-');
    return new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  const firstProjectedMonth = data?.projected?.[0]?.month;
  const s = data?.summary;

  return (
    <div className="space-y-6">
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Avg Monthly Revenue', value: fmt(s.avgMonthlyRevenue), icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
            { label: 'Avg Monthly Labor', value: fmt(s.avgMonthlyLabor), icon: Users, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Avg Monthly Profit', value: fmt(s.avgMonthlyProfit), icon: Wallet, color: s.avgMonthlyProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
            { label: 'Revenue Growth', value: `${s.revenueGrowthRate}%/mo`, icon: BarChart3, color: s.revenueGrowthRate >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Revenue vs Labor Cost</CardTitle>
          <CardDescription>
            {data?.historical?.length || 0} months historical · 3-month projection (dashed)
            {!allPoints.length && ' — No payroll or invoice data found for the selected period'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allPoints.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LineChart className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No financial data available yet. Data will appear once invoices and payroll runs are recorded.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={allPoints} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142,76%,36%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(142,76%,36%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorLabor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217,91%,60%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(217,91%,60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(v: any, name: string) => [fmt(Number(v)), name === 'revenue' ? 'Revenue' : name === 'laborCost' ? 'Labor Cost' : 'Profit']}
                  labelFormatter={fmtMonth}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend formatter={(v) => v === 'revenue' ? 'Revenue' : v === 'laborCost' ? 'Labor Cost' : 'Profit'} />
                {firstProjectedMonth && (
                  <ReferenceLine x={firstProjectedMonth} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'Projected', position: 'insideTopLeft', fontSize: 10 }} />
                )}
                <Area type="monotone" dataKey="revenue" stroke="hsl(142,76%,36%)" fill="url(#colorRevenue)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="laborCost" stroke="hsl(217,91%,60%)" fill="url(#colorLabor)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="profit" stroke="hsl(31,97%,50%)" fill="none" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FinancialManagement() {
  const modules = useModules();
  const module = modules.getModule('financial_management');
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);

  if (!module?.enabled) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Module Not Available</CardTitle>
            <CardDescription>Financial Management is not enabled for your subscription tier</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Fetch budgets from real API
  const { data: budgets = [], isLoading: budgetsLoading } = useQuery<Budget[]>({
    queryKey: ['/api/budgets'],
    enabled: !authLoading,
  });

  // Fetch budget line items for selected budget
  const { data: budgetLines = [], isLoading: linesLoading } = useQuery<BudgetLine[]>({
    queryKey: ['/api/budgets', selectedBudget, 'line-items'],
    enabled: !!selectedBudget,
  });

  const [newBudget, setNewBudget] = useState({
    name: "",
    department: "",
    totalAmount: 0,
    period: "Q1 2026",
  });

  // Create budget mutation
  const createBudgetMutation = useMutation({
    mutationFn: async (data: typeof newBudget) => {
      const response = await secureFetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create budget');
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/budgets'] });
      toast({
        title: "Budget created",
        description: "New budget has been created successfully",
      });
      setShowCreateDialog(false);
      setNewBudget({ name: "", department: "", totalAmount: 0, period: "Q1 2025" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create budget",
        variant: "destructive",
      });
    },
  });

  const handleCreateBudget = () => {
    if (!newBudget.name || !newBudget.department || newBudget.totalAmount <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill all fields with valid data",
        variant: "destructive",
      });
      return;
    }
    createBudgetMutation.mutate(newBudget);
  };

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.totalAmount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalRemaining = budgets.reduce((sum, b) => sum + b.remaining, 0);
  const utilizationRate = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const selectedBudgetData = budgets.find((b) => b.id === selectedBudget);

  const createBudgetButton = (
    <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-budget">
      <Plus className="h-4 w-4 mr-2" />
      New Budget
    </Button>
  );

  const pageConfig: CanvasPageConfig = {
    id: 'budgeting',
    title: 'AI Budgeting™',
    subtitle: 'Budget Planning & Financial Control',
    category: 'operations',
    headerActions: createBudgetButton,
  };

  return (
    <CanvasHubPage config={pageConfig}>
      {/* Overview Stats */}
      {budgetsLoading ? (
        <MetricsCardsSkeleton count={4} columns={4} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              Total Budgeted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${(totalBudgeted / 1000).toFixed(0)}K</p>
            <p className="text-xs text-muted-foreground">Across all budgets</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${(totalSpent / 1000).toFixed(0)}K</p>
            <p className="text-xs text-muted-foreground">{utilizationRate.toFixed(1)}% utilized</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalRemaining < 0 ? "text-red-500" : ""}`}>
              ${Math.abs(totalRemaining / 1000).toFixed(0)}K
            </p>
            <p className="text-xs text-muted-foreground">
              {totalRemaining < 0 ? "Over budget" : "Available"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              At Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {budgets.filter((b) => b.status !== "on_track").length}
            </p>
            <p className="text-xs text-muted-foreground">Budgets need attention</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="budgets" className="space-y-4">
        <TabsList className="w-full overflow-x-auto grid grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="budgets" data-testid="tab-budgets">
            <FileText className="h-4 w-4 mr-2" />
            Budgets
          </TabsTrigger>
          <TabsTrigger value="forecast" data-testid="tab-forecast">
            <LineChart className="h-4 w-4 mr-2" />
            Forecast
          </TabsTrigger>
          <TabsTrigger value="variance" data-testid="tab-variance">
            <BarChart3 className="h-4 w-4 mr-2" />
            Variance Analysis
          </TabsTrigger>
          <TabsTrigger value="approvals" data-testid="tab-approvals">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approvals
          </TabsTrigger>
        </TabsList>

        {/* Budgets Tab */}
        <TabsContent value="budgets" className="space-y-4">
          {budgetsLoading ? (
            <TableSkeleton rows={4} columns={3} compact={false} />
          ) : budgets.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No budgets created yet. Click "New Budget" to get started.
              </CardContent>
            </Card>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {budgets.map((budget) => {
              const utilizationPercent = (budget.spent / budget.totalAmount) * 100;
              return (
                <Card
                  key={budget.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedBudget(budget.id)}
                  data-testid={`budget-${budget.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{budget.name}</CardTitle>
                          <Badge
                            variant={
                              budget.status === "on_track"
                                ? "default"
                                : budget.status === "warning"
                                ? "secondary"
                                : "destructive"
                            }
                            className="h-5"
                          >
                            {budget.status === "on_track" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            ) : budget.status === "warning" ? (
                              <AlertTriangle className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {budget.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-3 text-xs">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {budget.department}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {budget.period}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Budgeted</p>
                        <p className="text-sm font-bold">${(budget.totalAmount / 1000).toFixed(0)}K</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Spent</p>
                        <p className="text-sm font-bold text-orange-500">
                          ${(budget.spent / 1000).toFixed(0)}K
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Remaining</p>
                        <p
                          className={`text-sm font-bold ${
                            budget.remaining < 0 ? "text-red-500" : "text-blue-500"
                          }`}
                        >
                          ${Math.abs(budget.remaining / 1000).toFixed(0)}K
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1 text-xs">
                        <span className="text-muted-foreground">Utilization</span>
                        <span className="font-medium">{utilizationPercent.toFixed(1)}%</span>
                      </div>
                      <Progress value={utilizationPercent} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground pt-2 border-t">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Owner: {budget.owner}
                      </span>
                      <Button variant="ghost" size="sm" className="h-6">
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast">
          <ForecastDashboard />
        </TabsContent>

        {/* Variance Analysis Tab */}
        <TabsContent value="variance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Budget vs Actual Variance Analysis</CardTitle>
              <CardDescription>Track budget performance by category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {budgetLines.map((line) => (
                  <Card key={line.id} className="hover-elevate" data-testid={`variance-${line.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <h4 className="font-medium">{line.category}</h4>
                        <Badge
                          variant={line.variance >= 0 ? "default" : "destructive"}
                          className="h-5"
                        >
                          {line.variance >= 0 ? (
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                          )}
                          {line.variancePercent > 0 ? "+" : ""}
                          {line.variancePercent.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Budgeted</p>
                          <p className="font-medium">${line.budgeted.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Actual</p>
                          <p className="font-medium">${line.actual.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Variance</p>
                          <p
                            className={`font-medium ${
                              line.variance >= 0 ? "text-blue-500" : "text-red-500"
                            }`}
                          >
                            ${Math.abs(line.variance).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals Tab */}
        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <CardTitle>Budget Approval Workflow</CardTitle>
              <CardDescription>Review and approve budget requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-16 text-muted-foreground">
                <CheckCircle2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Approval Queue</p>
                <p className="text-sm">No pending approvals at this time</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Budget Dialog */}
      <UniversalModal open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <UniversalModalContent size="md" data-testid="dialog-create-budget">
          <UniversalModalHeader>
            <UniversalModalTitle>Create New Budget</UniversalModalTitle>
            <UniversalModalDescription>
              Set up a new budget for your department or project
            </UniversalModalDescription>
          </UniversalModalHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="budget-name">Budget Name *</Label>
              <Input
                id="budget-name"
                placeholder="e.g., Q2 2025 Marketing Budget"
                value={newBudget.name}
                onChange={(e) => setNewBudget({ ...newBudget, name: e.target.value })}
                data-testid="input-budget-name"
              />
            </div>
            <div>
              <Label htmlFor="budget-department">Department *</Label>
              <Select
                value={newBudget.department}
                onValueChange={(value) => setNewBudget({ ...newBudget, department: value })}
              >
                <SelectTrigger id="budget-department" data-testid="select-budget-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="hr">Human Resources</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="budget-amount">Total Amount *</Label>
              <Input
                id="budget-amount"
                type="number"
                placeholder="50000"
                value={newBudget.totalAmount || ""}
                onChange={(e) =>
                  setNewBudget({ ...newBudget, totalAmount: parseFloat(e.target.value) || 0 })
                }
                data-testid="input-budget-amount"
              />
            </div>
            <div>
              <Label htmlFor="budget-period">Period *</Label>
              <Select
                value={newBudget.period}
                onValueChange={(value) => setNewBudget({ ...newBudget, period: value })}
              >
                <SelectTrigger id="budget-period" data-testid="select-budget-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q1 2025">Q1 2025</SelectItem>
                  <SelectItem value="Q2 2025">Q2 2025</SelectItem>
                  <SelectItem value="Q3 2025">Q3 2025</SelectItem>
                  <SelectItem value="Q4 2025">Q4 2025</SelectItem>
                  <SelectItem value="FY 2025">FY 2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBudget}
              disabled={!newBudget.name || !newBudget.department || newBudget.totalAmount <= 0}
              data-testid="button-create-budget-submit"
            >
              Create Budget
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
